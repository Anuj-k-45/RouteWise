import { useEffect, useState } from "react";
import {
  MapContainer,
  TileLayer,
  CircleMarker,
  Polyline,
  Tooltip,
  useMap,
  useMapEvents,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "./App.css";

const API_URL = "http://localhost:8080/api";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";

const DEPOT = {
  id: "DEPOT",
  name: "Vashi Warehouse",
  latitude: 19.07292,
  longitude: 72.98475,
};

async function fetchRoadGeometry(routePoints) {
  if (!Array.isArray(routePoints) || routePoints.length < 2) {
    throw new Error("The route must contain at least two points.");
  }

  const coordinates = routePoints
    .map((point) => `${point.longitude},${point.latitude}`)
    .join(";");

  const response = await fetch(
    `${OSRM_URL}/${coordinates}?overview=full&geometries=geojson`,
  );

  if (!response.ok) {
    throw new Error("Road directions are unavailable.");
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes?.[0]?.geometry?.coordinates?.length) {
    throw new Error("No road route could be found.");
  }

  return data.routes[0].geometry.coordinates.map(([longitude, latitude]) => [
    latitude,
    longitude,
  ]);
}

function MapClickHandler({ onMapClick }) {
  useMapEvents({
    click(event) {
      onMapClick(event.latlng);
    },
  });

  return null;
}

function MapCenterUpdater({ center }) {
  const map = useMap();
  const [latitude, longitude] = center;

  useEffect(() => {
    map.setView([latitude, longitude], map.getZoom(), { animate: true });
  }, [latitude, longitude, map]);

  return null;
}

function App() {
  const [points, setPoints] = useState([DEPOT]);
  const [result, setResult] = useState(null);
  const [routeView, setRouteView] = useState("optimal");
  const [originalRoadGeometry, setOriginalRoadGeometry] = useState([]);
  const [roadGeometry, setRoadGeometry] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState("Not checked");
  const [selectingDepot, setSelectingDepot] = useState(false);
  const [routeWarning, setRouteWarning] = useState("");

  function invalidateResult() {
    setResult(null);
    setOriginalRoadGeometry([]);
    setRoadGeometry([]);
    setError("");
    setRouteWarning("");
  }

  function addLocation(latlng) {
    if (selectingDepot) {
      setPoints((current) =>
        current.map((point, index) =>
          index === 0
            ? {
                ...point,
                latitude: Number(latlng.lat.toFixed(6)),
                longitude: Number(latlng.lng.toFixed(6)),
              }
            : point,
        ),
      );
      setSelectingDepot(false);
      invalidateResult();
      return;
    }

    const newPoint = {
      id: `STOP-${Date.now()}`,
      name: `Delivery ${points.length}`,
      latitude: Number(latlng.lat.toFixed(6)),
      longitude: Number(latlng.lng.toFixed(6)),
    };

    setPoints((current) => [...current, newPoint]);
    invalidateResult();
  }

  function removeLocation(id) {
    setPoints((current) => current.filter((point) => point.id !== id));
    invalidateResult();
  }

  function renameLocation(id, name) {
    setPoints((current) =>
      current.map((point) => (point.id === id ? { ...point, name } : point)),
    );
    invalidateResult();
  }

  async function optimizeRoute() {
    if (points.length < 2) {
      setError("Click on the map to add at least one delivery stop.");
      return;
    }

    setLoading(true);
    setError("");
    setRouteWarning("");
    setResult(null);
    setRoadGeometry([]);
    setOriginalRoadGeometry([]);
    setRouteView("optimal");

    let response;

    // Phase 1: Ask the Java backend to optimize the route.
    try {
      response = await fetch(`${API_URL}/routes/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
    } catch {
      setBackendStatus("Check connection");
      setError(
        "Could not connect to the backend. Make sure Spring Boot is running.",
      );
      setLoading(false);
      return;
    }

    // Receiving an HTTP response means the backend is reachable,
    // even if it rejects the request.
    setBackendStatus("Connected");

    if (!response.ok) {
      setError(`Route optimization failed (${response.status}).`);
      setLoading(false);
      return;
    }

    let data;

    try {
      data = await response.json();
    } catch {
      setError("The backend returned an invalid response.");
      setLoading(false);
      return;
    }

    if (
      !Array.isArray(data.originalRoute) ||
      !Array.isArray(data.optimizedRoute) ||
      data.originalRoute.length < 2 ||
      data.optimizedRoute.length < 2
    ) {
      setError(
        "The backend response is missing a valid original or optimized route.",
      );
      setLoading(false);
      return;
    }

    // Optimization succeeded. Preserve the result independently
    // of whether the external road-routing service is available.
    setResult(data);

    // Phase 2: Retrieve road geometry for both returned routes.
    const [originalResult, optimizedResult] = await Promise.allSettled([
      fetchRoadGeometry(data.originalRoute),
      fetchRoadGeometry(data.optimizedRoute),
    ]);

    if (originalResult.status === "fulfilled") {
      setOriginalRoadGeometry(originalResult.value);
    }

    if (optimizedResult.status === "fulfilled") {
      setRoadGeometry(optimizedResult.value);
    }

    const originalFailed = originalResult.status === "rejected";
    const optimizedFailed = optimizedResult.status === "rejected";

    if (originalFailed && optimizedFailed) {
      setRouteWarning(
        "Road directions are unavailable. Both routes are shown using straight map segments.",
      );
    } else if (originalFailed) {
      setRouteWarning(
        "Original-route road directions are unavailable. The original route uses straight map segments.",
      );
    } else if (optimizedFailed) {
      setRouteWarning(
        "Optimized-route road directions are unavailable. The optimized route uses straight map segments.",
      );
    }

    setLoading(false);
  }

  const displayedRoute = result?.optimizedRoute ?? [];
  const distanceSaved = result?.distanceSavedKm ?? 0;
  const savingPercent =
    result && result.originalDistanceKm > 0
      ? (distanceSaved / result.originalDistanceKm) * 100
      : 0;

  return (
    <main className="routewise">
      <aside className="sidebar">
        <header className="brand">
          <div className="brand-symbol">R</div>
          <div>
            <h1>routewise</h1>
            <p>DELIVERY INTELLIGENCE</p>
          </div>
        </header>

        <section className="planner-heading">
          <span className="eyebrow">ROUTE PLANNER</span>
          <h2>Build your route.</h2>
          <p>
            Edit the depot name, choose its map location, then add delivery
            stops.
          </p>
        </section>

        <section className="stop-section">
          <div className="section-title">
            <h3>Depot &amp; stops</h3>
            <span className="stop-count">{points.length}</span>
          </div>

          <div className="stop-list">
            {points.map((point, index) => (
              <article className="stop-card" key={point.id}>
                <div className={`stop-index ${index === 0 ? "depot" : ""}`}>
                  {index === 0 ? "D" : index}
                </div>

                <div className="stop-info">
                  <input
                    className="stop-name"
                    aria-label={`${index === 0 ? "Depot" : "Stop"} name`}
                    value={point.name}
                    onChange={(event) =>
                      renameLocation(point.id, event.target.value)
                    }
                  />
                  <span>
                    {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                  </span>
                </div>

                {index === 0 && (
                  <button
                    className={`depot-location-button ${
                      selectingDepot ? "selecting" : ""
                    }`}
                    onClick={() => setSelectingDepot((current) => !current)}
                    aria-pressed={selectingDepot}
                  >
                    {selectingDepot ? "Cancel" : "Choose"}
                  </button>
                )}

                {index !== 0 && (
                  <button
                    className="remove-stop"
                    onClick={() => removeLocation(point.id)}
                    aria-label={`Remove ${point.name}`}
                    title="Remove stop"
                  >
                    ×
                  </button>
                )}
              </article>
            ))}
          </div>

          <p className="map-hint">
            <span>{selectingDepot ? "D" : "＋"}</span>
            {selectingDepot
              ? "Click the map to set the depot location"
              : "Click anywhere on the map to add a stop"}
          </p>
        </section>

        <button
          className="optimize-button"
          onClick={optimizeRoute}
          disabled={loading || points.length < 2}
        >
          {loading ? "Finding best route..." : "✦  Optimize route"}
          {!loading && <span>→</span>}
        </button>

        {error && <div className="error-box">{error}</div>}

        {routeWarning && (
          <div className="error-box" role="status">
            {routeWarning}
          </div>
        )}

        <div className="sidebar-bottom">
          <span
            className={`connection-dot ${
              backendStatus === "Connected" ? "connected" : ""
            }`}
          />
          <span>API: {backendStatus}</span>
          <span className="api-port">localhost:8080</span>
        </div>
      </aside>

      <section className="map-workspace">
        <div className="map-topbar">
          <div>
            <span className="eyebrow">LIVE WORKSPACE</span>
            <h2>Delivery overview</h2>
          </div>

          <div className="map-legend">
            <span>
              <i className="legend-depot" /> Depot
            </span>
            <span>
              <i className="legend-stop" /> Delivery stop
            </span>
            <span>
              <i className="legend-route" /> Optimized route
            </span>
          </div>
        </div>

        {result && (
          <div className="route-toggle">
            <button
              className={routeView === "original" ? "active" : ""}
              onClick={() => setRouteView("original")}
            >
              Original Path
            </button>

            <button
              className={routeView === "optimal" ? "active" : ""}
              onClick={() => setRouteView("optimal")}
            >
              Optimal Path
            </button>
          </div>
        )}

        <div className="map-frame">
          <MapContainer
            center={[DEPOT.latitude, DEPOT.longitude]}
            zoom={13}
            scrollWheelZoom
            className="delivery-map"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            <MapCenterUpdater
              center={[points[0].latitude, points[0].longitude]}
            />
            <MapClickHandler onMapClick={addLocation} />

            {points.map((point, index) => (
              <CircleMarker
                key={point.id}
                center={[point.latitude, point.longitude]}
                radius={index === 0 ? 11 : 9}
                pathOptions={{
                  color: "#ffffff",
                  weight: 3,
                  fillColor: index === 0 ? "#7c6cff" : "#14b8a6",
                  fillOpacity: 1,
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} permanent>
                  {index === 0
                    ? `D · ${point.name}`
                    : `${index} · ${point.name}`}
                </Tooltip>
              </CircleMarker>
            ))}

            {result &&
              (() => {
                const selectedRoute =
                  routeView === "original"
                    ? result.originalRoute
                    : result.optimizedRoute;

                const selectedGeometry =
                  routeView === "original"
                    ? originalRoadGeometry
                    : roadGeometry;

                const positions =
                  selectedGeometry.length > 0
                    ? selectedGeometry
                    : selectedRoute.map((point) => [
                        point.latitude,
                        point.longitude,
                      ]);

                return positions.length > 1 ? (
                  <Polyline
                    positions={positions}
                    pathOptions={{
                      color: routeView === "original" ? "#E59A35" : "#6759F5",
                      weight: 5,
                      opacity: 0.95,
                      dashArray: routeView === "original" ? "8 6" : undefined,
                    }}
                  />
                ) : null;
              })()}
          </MapContainer>

          <div className="map-instruction">
            <span className="instruction-icon">
              {selectingDepot ? "D" : "＋"}
            </span>
            {selectingDepot
              ? "Click the map to choose the depot location"
              : "Click the map to place a delivery stop"}
          </div>

          {result && (
            <div className="map-result-badge">
              <span>✓</span> Route optimized
            </div>
          )}
        </div>

        <section className="results-panel">
          <div className="results-heading">
            <div>
              <span className="eyebrow">ROUTE ANALYTICS</span>
              <h3>
                {result ? "Your route at a glance" : "Ready when you are"}
              </h3>
            </div>
            {result && (
              <span className="savings-badge">
                {savingPercent.toFixed(1)}% shorter
              </span>
            )}
          </div>

          <div className="metric-grid">
            <article className="metric">
              <span>Total stops</span>
              <strong>{Math.max(points.length - 1, 0)}</strong>
              <small>Delivery locations</small>
            </article>

            <article className="metric">
              <span>Original distance</span>
              <strong>
                {result ? `${result.originalDistanceKm.toFixed(2)} km` : "—"}
              </strong>
              <small>Initial route estimate</small>
            </article>

            <article className="metric">
              <span>Optimized distance</span>
              <strong>
                {result ? `${result.optimizedDistanceKm.toFixed(2)} km` : "—"}
              </strong>
              <small>After optimization</small>
            </article>

            <article className="metric highlight-metric">
              <span>Distance saved</span>
              <strong>{result ? `${distanceSaved.toFixed(2)} km` : "—"}</strong>
              <small>Estimated reduction</small>
            </article>
          </div>

          {result && (
            <div className="sequence-section">
              <h4>
                {routeView === "original"
                  ? "Original stop sequence"
                  : "Optimized stop sequence"}
              </h4>

              <div className="sequence-list">
                {(routeView === "original"
                  ? result.originalRoute
                  : result.optimizedRoute
                ).map((point, index, sequence) => (
                  <div className="sequence-stop" key={`${point.id}-${index}`}>
                    <span className="sequence-number">
                      {index === 0
                        ? "D"
                        : index === sequence.length - 1
                          ? "↩"
                          : index}
                    </span>

                    <span>{point.name}</span>

                    {index === 0 && <small>START</small>}

                    {index === sequence.length - 1 && <small>RETURN</small>}
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="distance-note">
            Route order and distance estimates are calculated by the Java
            backend using straight-line distances. Road-following lines are
            provided by OSRM when available, so map geometry may differ from the
            distances used by the optimizer.
          </p>
        </section>
      </section>
    </main>
  );
}

export default App;
