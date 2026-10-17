(function () {
  'use strict';

  // ---------- Elements ----------
  var form = document.getElementById('search-form');
  var input = document.getElementById('city-input');
  var searchBtn = document.getElementById('search-btn');
  var statusEl = document.getElementById('status');
  var errorEl = document.getElementById('error');
  var resultEl = document.getElementById('result');
  var recentSection = document.getElementById('recent-section');
  var recentList = document.getElementById('recent-list');

  var resultCity = document.getElementById('result-city');
  var resultMeta = document.getElementById('result-meta');
  var weatherIcon = document.getElementById('weather-icon');
  var tempValue = document.getElementById('temp-value');
  var weatherDesc = document.getElementById('weather-desc');
  var humidityValue = document.getElementById('humidity-value');
  var windValue = document.getElementById('wind-value');
  var feelsValue = document.getElementById('feels-value');
  var updatedAt = document.getElementById('updated-at');

  // ---------- State ----------
  var recentSearches = []; // array of city labels searched this session
  var requestToken = 0;    // guards against a stale response overwriting a newer one

  // WMO weather codes -> { label, icon }. Open-Meteo returns a numeric code;
  // this is how "complex nested JSON" (the API's weather_code) gets turned
  // into something readable on screen.
  var WEATHER_CODES = {
    0: { label: 'Clear sky', icon: '☀️' },
    1: { label: 'Mainly clear', icon: '🌤️' },
    2: { label: 'Partly cloudy', icon: '⛅' },
    3: { label: 'Overcast', icon: '☁️' },
    45: { label: 'Fog', icon: '🌫️' },
    48: { label: 'Depositing rime fog', icon: '🌫️' },
    51: { label: 'Light drizzle', icon: '🌦️' },
    53: { label: 'Moderate drizzle', icon: '🌦️' },
    55: { label: 'Dense drizzle', icon: '🌦️' },
    61: { label: 'Slight rain', icon: '🌧️' },
    63: { label: 'Moderate rain', icon: '🌧️' },
    65: { label: 'Heavy rain', icon: '🌧️' },
    66: { label: 'Freezing rain', icon: '🌧️' },
    67: { label: 'Heavy freezing rain', icon: '🌧️' },
    71: { label: 'Slight snow fall', icon: '🌨️' },
    73: { label: 'Moderate snow fall', icon: '🌨️' },
    75: { label: 'Heavy snow fall', icon: '🌨️' },
    77: { label: 'Snow grains', icon: '🌨️' },
    80: { label: 'Slight rain showers', icon: '🌦️' },
    81: { label: 'Moderate rain showers', icon: '🌦️' },
    82: { label: 'Violent rain showers', icon: '⛈️' },
    85: { label: 'Slight snow showers', icon: '🌨️' },
    86: { label: 'Heavy snow showers', icon: '🌨️' },
    95: { label: 'Thunderstorm', icon: '⛈️' },
    96: { label: 'Thunderstorm, slight hail', icon: '⛈️' },
    99: { label: 'Thunderstorm, heavy hail', icon: '⛈️' }
  };

  function describeWeatherCode(code) {
    return WEATHER_CODES[code] || { label: 'Unknown conditions', icon: '🌡️' };
  }

  // ---------- A small app-specific error type, so the catch block can
  // tell "city not found" apart from "the network/API failed". ----------
  function WeatherAppError(message) {
    this.name = 'WeatherAppError';
    this.message = message;
  }
  WeatherAppError.prototype = Object.create(Error.prototype);

  // ---------- Step 1: turn a city name into coordinates (geocoding) ----------
  async function geocodeCity(cityName) {
    var url = 'https://geocoding-api.open-meteo.com/v1/search?name=' +
      encodeURIComponent(cityName) + '&count=1&language=en&format=json';

    var response;
    try {
      response = await fetch(url);
    } catch (networkError) {
      throw new WeatherAppError('Could not reach the weather service. Check your connection and try again.');
    }

    if (!response.ok) {
      throw new WeatherAppError('The location lookup failed (status ' + response.status + '). Try again shortly.');
    }

    var data = await response.json();

    if (!data.results || data.results.length === 0) {
      throw new WeatherAppError('No city found matching "' + cityName + '". Check the spelling and try again.');
    }

    var place = data.results[0];
    return {
      name: place.name,
      country: place.country || '',
      admin1: place.admin1 || '',
      latitude: place.latitude,
      longitude: place.longitude
    };
  }

  // ---------- Step 2: fetch current weather for those coordinates ----------
  async function fetchWeather(latitude, longitude) {
    var params = [
      'latitude=' + latitude,
      'longitude=' + longitude,
      'current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code',
      'timezone=auto'
    ].join('&');
    var url = 'https://api.open-meteo.com/v1/forecast?' + params;

    var response;
    try {
      response = await fetch(url);
    } catch (networkError) {
      throw new WeatherAppError('Could not reach the weather service. Check your connection and try again.');
    }

    if (!response.ok) {
      throw new WeatherAppError('The weather service returned an error (status ' + response.status + ').');
    }

    var data = await response.json();

    if (!data.current) {
      throw new WeatherAppError('The weather service returned an unexpected response. Try again shortly.');
    }

    return data.current;
  }

  // ---------- Orchestration: geocode, then fetch weather, then render ----------
  async function searchWeather(cityName) {
    var myToken = ++requestToken;

    setLoading(true);
    clearError();
    announce('Searching for ' + cityName + '…');

    try {
      var place = await geocodeCity(cityName);
      var current = await fetchWeather(place.latitude, place.longitude);

      if (myToken !== requestToken) { return; } // a newer search started meanwhile; drop this one

      renderResult(place, current);
      addRecentSearch(place);
      announce('Showing weather for ' + place.name + '.');
    } catch (err) {
      if (myToken !== requestToken) { return; }
      var message = err instanceof WeatherAppError
        ? err.message
        : 'Something unexpected went wrong. Please try again.';
      showError(message);
      announce('');
    } finally {
      if (myToken === requestToken) { setLoading(false); }
    }
  }

  // ---------- Rendering ----------
  function renderResult(place, current) {
    var locationLabel = [place.name, place.admin1, place.country].filter(Boolean).join(', ');
    resultCity.textContent = place.name;
    resultMeta.textContent = locationLabel;

    var desc = describeWeatherCode(current.weather_code);
    weatherIcon.textContent = desc.icon;
    weatherDesc.textContent = desc.label;

    tempValue.textContent = Math.round(current.temperature_2m);
    humidityValue.textContent = current.relative_humidity_2m + '%';
    windValue.textContent = Math.round(current.wind_speed_10m) + ' km/h';
    feelsValue.textContent = Math.round(current.apparent_temperature) + '°C';

    var time = new Date(current.time);
    updatedAt.textContent = 'Updated ' + time.toLocaleString(undefined, {
      hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short'
    });

    resultEl.hidden = false;
  }

  function addRecentSearch(place) {
    var label = place.name + (place.country ? ', ' + place.country : '');
    recentSearches = recentSearches.filter(function (s) { return s.label !== label; });
    recentSearches.unshift({ label: label, query: place.name });
    recentSearches = recentSearches.slice(0, 5);
    renderRecentSearches();
  }

  function renderRecentSearches() {
    recentList.innerHTML = '';
    recentSearches.forEach(function (entry) {
      var li = document.createElement('li');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = entry.label;
      btn.addEventListener('click', function () {
        input.value = entry.query;
        searchWeather(entry.query);
      });
      li.appendChild(btn);
      recentList.appendChild(li);
    });
    recentSection.hidden = recentSearches.length === 0;
  }

  // ---------- UI state helpers ----------
  function setLoading(isLoading) {
    searchBtn.disabled = isLoading;
    statusEl.textContent = isLoading ? 'Loading…' : '';
  }

  function showError(message) {
    errorEl.textContent = message;
    errorEl.hidden = false;
    resultEl.hidden = true;
  }

  function clearError() {
    errorEl.hidden = true;
    errorEl.textContent = '';
  }

  function announce(message) {
    statusEl.textContent = message;
  }

  // ---------- Events ----------
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var city = input.value.trim();
    if (!city) { return; }
    searchWeather(city);
  });

  // ---------- Initial load: show a default city so the dashboard isn't empty ----------
  searchWeather('Mysuru');
})();