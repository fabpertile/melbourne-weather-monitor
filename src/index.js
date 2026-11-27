var BOM_CURRENT_URL = "https://www.bom.gov.au/fwo/IDV60901/IDV60901.95936.json";
var BOM_DAILY_LATEST_URL = "https://www.bom.gov.au/clim_data/dwodata/IDCJDW3033.latest.shtml";
var BOM_FORECAST_URL = "https://www.bom.gov.au/fwo/IDV10753.xml";

function jsonResponse(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "public, max-age=300",
      "access-control-allow-origin": "*"
    }
  });
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "");
}

function numeric(value) {
  var text = cleanText(value).replace(/,/g, "");
  if (!text || text === "-" || text === "—") return null;
  var number = parseFloat(text);
  return isNaN(number) ? null : number;
}

function average(a, b) {
  if (a === null && b === null) return null;
  if (a === null) return b;
  if (b === null) return a;
  return (a + b) / 2;
}

function dateKey(year, month, day) {
  return String(year) + "-" + ("0" + month).slice(-2) + "-" + ("0" + day).slice(-2);
}

function melbourneDateParts() {
  var parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Melbourne",
    year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  var result = {};
  for (var i = 0; i < parts.length; i++) result[parts[i].type] = parts[i].value;
  return { year: parseInt(result.year, 10), month: parseInt(result.month, 10), day: parseInt(result.day, 10) };
}

function parseDailyPage(html) {
  var rows = {};
  var heading = html.match(/([A-Z][a-z]+)\s+(20\d{2})\s+Daily Weather Observations/i);
  if (!heading) return rows;

  var monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var month = monthNames.indexOf(heading[1]) + 1;
  var year = parseInt(heading[2], 10);
  if (!month) return rows;

  var tr = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  var match;
  while ((match = tr.exec(html))) {
    var cells = [];
    var td = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    var cell;
    while ((cell = td.exec(match[1]))) cells.push(cleanText(cell[1]));
    if (cells.length < 22) continue;

    var day = parseInt(cells[0], 10);
    if (!day || day < 1 || day > 31) continue;
    rows[dateKey(year, month, day)] = {
      date: dateKey(year, month, day),
      tempMin: numeric(cells[2]),
      temp: numeric(cells[3]),
      humidity: average(numeric(cells[11]), numeric(cells[17])),
      pressure: average(numeric(cells[15]), numeric(cells[21])),
      wind: average(numeric(cells[14]), numeric(cells[20])),
      uv: null
    };
  }
  return rows;
}

function xmlAttribute(tag, name) {
  var re = new RegExp(name + '="([^"]*)"', "i");
  var match = tag.match(re);
  return match ? match[1] : "";
}

function xmlElement(block, type) {
  var re = new RegExp('<element\\b(?=[^>]*type="' + type + '")[^>]*>([\\s\\S]*?)<\\/element>', "i");
  var match = block.match(re);
  return match ? numeric(match[1]) : null;
}

function parseForecast(xml) {
  var result = {};
  var areaMatch = xml.match(/<area\b(?=[^>]*(?:description="Melbourne"|aac="VIC_PT042"))[^>]*>([\s\S]*?)<\/area>/i);
  var area = areaMatch ? areaMatch[1] : xml;
  var re = /<forecast-period\b[^>]*>[\s\S]*?<\/forecast-period>/gi;
  var match;
  while ((match = re.exec(area))) {
    var block = match[0];
    var openTag = block.match(/^<forecast-period\b[^>]*>/i);
    if (!openTag) continue;
    var start = xmlAttribute(openTag[0], "start-time-local");
    var date = start.substring(0, 10);
    if (!/^20\d\d-\d\d-\d\d$/.test(date)) continue;
    result[date] = {
      date: date,
      temp: xmlElement(block, "air_temperature_maximum"),
      tempMin: xmlElement(block, "air_temperature_minimum"),
      pressure: null,
      humidity: null,
      uv: null,
      wind: null
    };
  }
  return result;
}

async function fetchText(url) {
  var response = await fetch(url, { headers: { "user-agent": "MelbourneWeatherMonitor/1.0" } });
  if (!response.ok) throw new Error("BOM request failed (HTTP " + response.status + ")");
  return await response.text();
}

async function fetchJson(url) {
  var response = await fetch(url, { headers: { "user-agent": "MelbourneWeatherMonitor/1.0" } });
  if (!response.ok) throw new Error("BOM request failed (HTTP " + response.status + ")");
  return await response.json();
}

async function getBomWeather() {
  var now = melbourneDateParts();
  var previousMonth = now.month === 1 ? 12 : now.month - 1;
  var previousYear = now.month === 1 ? now.year - 1 : now.year;
  var previousMonthUrl = "https://www.bom.gov.au/clim_data/dwodata/IDCJDW3033." + previousYear + ("0" + previousMonth).slice(-2) + ".shtml";

  var responses = await Promise.all([
    fetchJson(BOM_CURRENT_URL),
    fetchText(BOM_DAILY_LATEST_URL),
    fetchText(previousMonthUrl).catch(function() { return ""; }),
    fetchText(BOM_FORECAST_URL).catch(function() { return ""; })
  ]);

  var observation = responses[0] && responses[0].observations;
  var observationData = observation && observation.data && observation.data.length ? observation.data[0] : null;
  if (!observationData) throw new Error("BOM did not return a current Olympic Park observation");

  var history = parseDailyPage(responses[1]);
  if (responses[2]) {
    var previousHistory = parseDailyPage(responses[2]);
    for (var oldDate in previousHistory) if (previousHistory.hasOwnProperty(oldDate)) history[oldDate] = previousHistory[oldDate];
  }

  var forecast = responses[3] ? parseForecast(responses[3]) : {};
  var current = {
    temperature: numeric(observationData.air_temp),
    pressure: numeric(observationData.press_msl),
    humidity: numeric(observationData.rel_hum),
    uv: null,
    wind: numeric(observationData.wind_spd_kmh),
    windDirection: observationData.wind_dir || null,
    observationTime: observationData.local_date_time || null
  };

  var days = [];
  var base = new Date(Date.UTC(now.year, now.month - 1, now.day));
  for (var offset = -7; offset <= 7; offset++) {
    var d = new Date(base.getTime() + offset * 86400000);
    var key = dateKey(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    var value = history[key] || forecast[key] || {
      date: key, temp: null, tempMin: null, pressure: null, humidity: null, uv: null, wind: null
    };
    if (key === dateKey(now.year, now.month, now.day)) {
      value = {
        date: key,
        temp: history[key] ? history[key].temp : null,
        tempMin: history[key] ? history[key].tempMin : null,
        pressure: history[key] ? history[key].pressure : null,
        humidity: history[key] ? history[key].humidity : null,
        uv: null,
        wind: history[key] ? history[key].wind : null
      };
    }
    if (offset > 0 && forecast[key]) value = forecast[key];
    days.push(value);
  }

  return {
    source: "BOM",
    location: "Melbourne (Olympic Park)",
    current: current,
    daily: days
  };
}

export default {
  async fetch(request, env) {
    var url = new URL(request.url);

    if (url.pathname === "/api/bom-weather") {
      try {
        return jsonResponse(await getBomWeather());
      } catch (error) {
        return jsonResponse({ error: error.message || "Unable to retrieve BOM data" }, 502);
      }
    }

    if (url.pathname === "/api/weather") {
      var upstream = new URL("https://api.open-meteo.com/v1/forecast");
      upstream.search = url.search;
      return fetch(upstream.toString());
    }

    if (url.pathname === "/api/geocode") {
      var geocode = new URL("https://geocoding-api.open-meteo.com/v1/search");
      geocode.search = url.search;
      return fetch(geocode.toString());
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Dashboard files are not configured yet.", { status: 503 });
  }
};
