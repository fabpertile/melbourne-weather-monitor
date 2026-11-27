
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Weather forecast proxy
    if (url.pathname === "/api/weather") {
      const upstream = new URL(
        "https://api.open-meteo.com/v1/forecast"
      );

      upstream.search = url.search;

      return fetch(upstream.toString());
    }

    // City search proxy
    if (url.pathname === "/api/geocode") {
      const upstream = new URL(
        "https://geocoding-api.open-meteo.com/v1/search"
      );

      upstream.search = url.search;

      return fetch(upstream.toString());
    }

    // Serve the dashboard
    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response(
      "Dashboard files are not configured yet.",
      { status: 503 }
    );
  }
};
