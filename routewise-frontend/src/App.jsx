import { useEffect, useMemo, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url";
import "maplibre-gl/dist/maplibre-gl.css";

maplibregl.setWorkerUrl(workerUrl);
import "./App.css";

const API_URL = "http://localhost:8080/api";
const OSRM_URL = "https://router.project-osrm.org/route/v1/driving";
const DEPOT = {
  id: "DEPOT",
  name: "Vashi Warehouse",
  latitude: 19.07292,
  longitude: 72.98475,
};

async function fetchRoadRoute(points) {
  if (!Array.isArray(points) || points.length < 2)
    throw new Error("The route needs at least two points.");

  const coords = points.map((p) => `${p.longitude},${p.latitude}`).join(";");
  const response = await fetch(
    `${OSRM_URL}/${coords}?overview=full&geometries=geojson&steps=true`,
  );
  if (!response.ok) throw new Error("Road directions are unavailable.");

  const data = await response.json();
  const route = data.routes?.[0];
  if (data.code !== "Ok" || !route?.geometry?.coordinates?.length)
    throw new Error("No road route could be found.");

  const toLatLng = (coordinates) =>
    coordinates.map(([lng, lat]) => [lat, lng]);
  const legs = (route.legs || []).map((leg, index) => {
    const coordinates = (leg.steps || []).flatMap(
      (step) => step.geometry?.coordinates || [],
    );
    const deduplicated = coordinates.filter(
      (coordinate, coordinateIndex) =>
        coordinateIndex === 0 ||
        coordinate[0] !== coordinates[coordinateIndex - 1][0] ||
        coordinate[1] !== coordinates[coordinateIndex - 1][1],
    );
    if (deduplicated.length >= 2) return toLatLng(deduplicated);
    return [
      [points[index].latitude, points[index].longitude],
      [points[index + 1].latitude, points[index + 1].longitude],
    ];
  });

  return {
    geometry: toLatLng(route.geometry.coordinates),
    legs,
  };
}

const MAP_STYLES = {
  light: "https://tiles.openfreemap.org/styles/positron",
  standard: "https://tiles.openfreemap.org/styles/liberty",
};

function MapWorkspace({
  points,
  routePositions,
  routeLegs,
  routeView,
  activePointId,
  completedPointIds,
  selectingDepot,
  mapLayer,
  fitVersion,
  center,
  isPlaying,
  followMarker,
  animationProgress,
  playbackSpeed,
  animationResetKey,
  onAnimationProgress,
  onMapClick,
  onSelectPoint,
}) {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const styleRef = useRef(mapLayer);
  const markersRef = useRef([]);
  const vehicleMarkerRef = useRef(null);
  const onMapClickRef = useRef(onMapClick);
  const onSelectPointRef = useRef(onSelectPoint);
  const onAnimationProgressRef = useRef(onAnimationProgress);
  const routePositionsRef = useRef(routePositions);
  const routeLegsRef = useRef(routeLegs);
  const routeViewRef = useRef(routeView);
  const pointsRef = useRef(points);
  const activePointIdRef = useRef(activePointId);
  const completedPointIdsRef = useRef(completedPointIds);
  const animationProgressRef = useRef(animationProgress);
  const followMarkerRef = useRef(followMarker);

  useEffect(() => { onMapClickRef.current = onMapClick; }, [onMapClick]);
  useEffect(() => { onSelectPointRef.current = onSelectPoint; }, [onSelectPoint]);
  useEffect(() => { onAnimationProgressRef.current = onAnimationProgress; }, [onAnimationProgress]);
  useEffect(() => { followMarkerRef.current = followMarker; }, [followMarker]);
  useEffect(() => {
    routePositionsRef.current = routePositions;
    routeLegsRef.current = routeLegs;
    routeViewRef.current = routeView;
    pointsRef.current = points;
    activePointIdRef.current = activePointId;
    completedPointIdsRef.current = completedPointIds;
    animationProgressRef.current = animationProgress;
  }, [routePositions, routeLegs, routeView, points, activePointId, completedPointIds, animationProgress]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLES[mapLayer] || MAP_STYLES.light,
      center: [center[1], center[0]],
      zoom: 13.2,
      pitch: 55,
      bearing: -18,
      maxPitch: 75,
      antialias: true,
      attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.on("click", (event) =>
      onMapClickRef.current({ lat: event.lngLat.lat, lng: event.lngLat.lng }),
    );
    map.on("load", () => {
      add3DBuildings(map);
      syncRouteLayer(map, routePositionsRef.current, routeViewRef.current);
      renderMarkers(
        map, pointsRef.current, activePointIdRef.current,
        completedPointIdsRef.current, markersRef, onSelectPointRef,
      );
      drawSimulationFrame(
        map, routeLegsRef.current, animationProgressRef.current,
        routeViewRef.current, vehicleMarkerRef,
      );
    });
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(containerRef.current);
    return () => {
      resizeObserver.disconnect();
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      removeVehicleMarker(vehicleMarkerRef);
      map.remove();
      mapRef.current = null;
    };
    // Map instance is intentionally created once; live values flow through refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const nextStyle = MAP_STYLES[mapLayer] || MAP_STYLES.light;
    if (styleRef.current === mapLayer) return;
    styleRef.current = mapLayer;
    map.setStyle(nextStyle);
    map.once("style.load", () => {
      add3DBuildings(map);
      syncRouteLayer(map, routePositionsRef.current, routeViewRef.current);
      renderMarkers(
        map, pointsRef.current, activePointIdRef.current,
        completedPointIdsRef.current, markersRef, onSelectPointRef,
      );
      drawSimulationFrame(
        map, routeLegsRef.current, animationProgressRef.current,
        routeViewRef.current, vehicleMarkerRef,
      );
    });
  }, [mapLayer]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const render = () => renderMarkers(
      map, points, activePointId, completedPointIds, markersRef, onSelectPointRef,
    );
    if (map.isStyleLoaded()) render();
    else map.once("load", render);
  }, [points, activePointId, completedPointIds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const update = () => {
      syncRouteLayer(map, routePositions, routeView);
      drawSimulationFrame(map, routeLegs, animationProgress, routeView, vehicleMarkerRef);
    };
    if (map.isStyleLoaded()) update();
    else map.once("style.load", update);
  }, [routePositions, routeLegs, routeView, mapLayer]);

  // The animation loop owns frame-by-frame updates. This effect only paints a
  // stable frame when paused, reset, or when a route is first loaded.
  useEffect(() => {
    if (isPlaying) return;
    const map = mapRef.current;
    if (map?.isStyleLoaded())
      drawSimulationFrame(map, routeLegs, animationProgress, routeView, vehicleMarkerRef);
  }, [isPlaying, animationProgress, routeLegs, routeView, animationResetKey]);

  useEffect(() => {
    if (!isPlaying || routeLegs.length === 0) return;
    const map = mapRef.current;
    if (!map?.isStyleLoaded()) return;

    const MOVE_MS = 2700;
    const DWELL_MS = 550;
    const cycleMs = MOVE_MS + DWELL_MS;
    const totalDuration = routeLegs.length * cycleMs;
    let progress = Math.min(animationProgress, 0.9999);
    let previousTime = 0;
    let lastPublish = 0;
    let frameId;

    const tick = (now) => {
      if (!previousTime) previousTime = now;
      const delta = Math.min(now - previousTime, 80);
      previousTime = now;
      progress = Math.min(1, progress + (delta * playbackSpeed) / totalDuration);
      drawSimulationFrame(map, routeLegs, progress, routeView, vehicleMarkerRef, MOVE_MS, DWELL_MS, followMarkerRef.current);

      if (now - lastPublish > 90 || progress >= 1) {
        const timeMs = progress * totalDuration;
        const legIndex = progress >= 1
          ? routeLegs.length - 1
          : Math.min(Math.floor(timeMs / cycleMs), routeLegs.length - 1);
        const phase = progress >= 1 ? cycleMs : timeMs - legIndex * cycleMs;
        const legProgress = Math.min(1, phase / MOVE_MS);
        // Each leg delivers to its destination when the movement phase finishes.
        // The final leg returns to the depot, so it must not increase deliveries.
        const completedCount = progress >= 1
          ? Math.max(0, routeLegs.length - 1)
          : Math.min(
              Math.max(0, routeLegs.length - 1),
              legIndex + (phase >= MOVE_MS - 0.5 ? 1 : 0),
            );
        onAnimationProgressRef.current?.({
          progress,
          legIndex,
          legProgress,
          completedCount,
        });
        lastPublish = now;
      }
      if (progress >= 1) return;
      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
    // animationProgress is deliberately read only when playback starts/resumes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, routeLegs, playbackSpeed, animationResetKey, routeView]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (fitVersion > 0 && points.length > 1) {
      const bounds = new maplibregl.LngLatBounds();
      points.forEach((point) => bounds.extend([point.longitude, point.latitude]));
      map.fitBounds(bounds, {
        padding: { top: 70, right: 75, bottom: 85, left: 65 },
        maxZoom: 15.5,
        duration: 700,
        pitch: 52,
      });
    } else map.easeTo({ center: [center[1], center[0]], duration: 500 });
  }, [fitVersion, center, points]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const focus = (event) => {
      const { latitude, longitude } = event.detail || {};
      if (Number.isFinite(latitude) && Number.isFinite(longitude))
        map.flyTo({ center: [longitude, latitude], zoom: Math.max(map.getZoom(), 15), pitch: 58, duration: 700 });
    };
    window.addEventListener("routewise-focus-point", focus);
    return () => window.removeEventListener("routewise-focus-point", focus);
  }, []);

  return <div ref={containerRef} className="rw-maplibre-map" aria-label="Interactive 3D delivery route map" />;
}

function add3DBuildings(map) {
  const style = map.getStyle();
  const buildingStyleLayer = (style.layers || []).find(
    (layer) => layer["source-layer"] === "building" && layer.source,
  );
  const vectorSourceId = buildingStyleLayer?.source ||
    Object.entries(style.sources || {}).find(([, source]) => source.type === "vector")?.[0];
  const beforeId = (style.layers || []).find((layer) => layer.type === "symbol")?.id;
  if (!vectorSourceId || (style.layers || []).some((layer) => layer.id === "routewise-3d-buildings")) return;
  try {
    map.addLayer({
      id: "routewise-3d-buildings",
      source: vectorSourceId,
      "source-layer": "building",
      type: "fill-extrusion",
      minzoom: 13,
      filter: ["any", ["has", "render_height"], ["has", "height"]],
      paint: {
        "fill-extrusion-color": [
          "interpolate", ["linear"], ["coalesce", ["get", "render_height"], ["get", "height"], 6],
          0, "#d9e0d7", 30, "#aebdb0", 100, "#8fa695",
        ],
        "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 6],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
        "fill-extrusion-opacity": 0.88,
      },
    }, beforeId);
  } catch (error) {
    console.warn("3D building layer could not be added for this map style.", error);
  }
}

function routeFeature(positions) {
  if (!positions || positions.length < 2)
    return { type: "FeatureCollection", features: [] };
  return {
    type: "Feature",
    properties: {},
    geometry: { type: "LineString", coordinates: positions.map(([lat, lng]) => [lng, lat]) },
  };
}

function syncRouteLayer(map, positions, routeView) {
  if (!map || !map.isStyleLoaded()) return;
  const coordinates = positions.map(([lat, lng]) => [lng, lat]);
  const source = map.getSource("routewise-route");
  if (source) source.setData(routeFeature(positions));
  else {
    map.addSource("routewise-route", { type: "geojson", data: routeFeature(positions) });
    const beforeId = (map.getStyle().layers || []).find((layer) => layer.type === "symbol")?.id;
    map.addLayer({
      id: "routewise-route-casing",
      type: "line",
      source: "routewise-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.94 },
    }, beforeId);
    map.addLayer({
      id: "routewise-route-line",
      type: "line",
      source: "routewise-route",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#9eb4a4", "line-width": 5, "line-opacity": 0.42 },
    }, beforeId);
  }
  if (map.getLayer("routewise-route-line")) {
    map.setPaintProperty("routewise-route-line", "line-color", routeView === "original" ? "#a5a7a1" : "#83b49a");
    map.setPaintProperty("routewise-route-line", "line-dasharray", routeView === "original" ? [2, 2] : [1, 0]);
    map.setLayoutProperty("routewise-route-line", "visibility", coordinates.length > 1 ? "visible" : "none");
    map.setLayoutProperty("routewise-route-casing", "visibility", coordinates.length > 1 ? "visible" : "none");
  }
  if (!map.getSource("routewise-progress")) {
    map.addSource("routewise-progress", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "routewise-progress-casing",
      type: "line",
      source: "routewise-progress",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": "#ffffff", "line-width": 10, "line-opacity": 0.98 },
    });
    map.addLayer({
      id: "routewise-progress-line",
      type: "line",
      source: "routewise-progress",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: { "line-color": routeView === "original" ? "#4c789f" : "#168353", "line-width": 5.5, "line-opacity": 1 },
    });
  }
  if (map.getLayer("routewise-progress-line"))
    map.setPaintProperty("routewise-progress-line", "line-color", routeView === "original" ? "#4c789f" : "#168353");
}

function haversineDistance(a, b) {
  const rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad;
  const dLng = (b[1] - a[1]) * rad;
  const lat1 = a[0] * rad;
  const lat2 = b[0] * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}

function pointAlongPath(path, fraction) {
  if (!path?.length) return { point: [19.07292, 72.98475], bearing: 0 };
  if (path.length === 1) return { point: path[0], bearing: 0 };
  const lengths = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const length = haversineDistance(path[i - 1], path[i]);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return { point: path[0], bearing: 0 };
  let target = Math.max(0, Math.min(1, fraction)) * total;
  for (let i = 0; i < lengths.length; i++) {
    const segmentLength = lengths[i];
    if (target <= segmentLength || i === lengths.length - 1) {
      const t = segmentLength ? Math.min(1, target / segmentLength) : 0;
      const from = path[i];
      const to = path[i + 1];
      const rad = Math.PI / 180;
      const y = Math.sin((to[1] - from[1]) * rad) * Math.cos(to[0] * rad);
      const x = Math.cos(from[0] * rad) * Math.sin(to[0] * rad) -
        Math.sin(from[0] * rad) * Math.cos(to[0] * rad) * Math.cos((to[1] - from[1]) * rad);
      const bearing = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      return {
        point: [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t],
        bearing,
      };
    }
    target -= segmentLength;
  }
  return { point: path[path.length - 1], bearing: 0 };
}

function partialPathCoordinates(path, fraction) {
  if (!path || path.length < 2 || fraction <= 0) return [];
  if (fraction >= 1) return path.map(([lat, lng]) => [lng, lat]);
  const partial = [];
  const total = path.slice(1).reduce((sum, point, index) => sum + haversineDistance(path[index], point), 0);
  if (total <= 0) return [];
  let target = total * fraction;
  partial.push([path[0][1], path[0][0]]);
  for (let i = 1; i < path.length; i++) {
    const length = haversineDistance(path[i - 1], path[i]);
    if (target >= length) {
      partial.push([path[i][1], path[i][0]]);
      target -= length;
    } else {
      const t = length ? target / length : 0;
      partial.push([
        path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t,
        path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t,
      ]);
      break;
    }
  }
  return partial.length >= 2 ? partial : [];
}

function removeVehicleMarker(vehicleMarkerRef) {
  vehicleMarkerRef.current?.remove?.();
  vehicleMarkerRef.current = null;
}

function drawSimulationFrame(map, legs, progress, routeView, vehicleMarkerRef, moveMs = 2700, dwellMs = 550, followCamera = false) {
  if (!map || !map.isStyleLoaded() || !legs?.length) {
    vehicleMarkerRef.current?.remove();
    vehicleMarkerRef.current = null;
    return;
  }
  const safeProgress = Math.max(0, Math.min(1, progress || 0));
  const cycleMs = moveMs + dwellMs;
  const totalMs = legs.length * cycleMs;
  const elapsed = safeProgress * totalMs;
  const legIndex = safeProgress >= 1
    ? legs.length - 1
    : Math.min(Math.floor(elapsed / cycleMs), legs.length - 1);
  const phase = safeProgress >= 1 ? cycleMs : elapsed - legIndex * cycleMs;
  const legProgress = Math.min(1, phase / moveMs);
  const completedLegs = legs.slice(0, legIndex).map((leg) =>
    leg.map(([lat, lng]) => [lng, lat]),
  );
  const currentPartial = partialPathCoordinates(legs[legIndex], legProgress);
  if (currentPartial.length >= 2) completedLegs.push(currentPartial);
  const progressSource = map.getSource("routewise-progress");
  if (progressSource) {
    progressSource.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "MultiLineString", coordinates: completedLegs },
    });
  }

  const { point, bearing } = pointAlongPath(legs[legIndex], legProgress);
  if (!vehicleMarkerRef.current) {
    const element = document.createElement("div");
    element.className = "rw-vehicle-marker";
    element.setAttribute("aria-label", "Current delivery position");
    element.innerHTML = `
      <svg class="rw-navigation-arrow" viewBox="0 0 36 36" aria-hidden="true">
        <path d="M18 2.5 L31.5 32.5 L18 25.2 L4.5 32.5 Z"
          fill="#4285F4" stroke="#ffffff" stroke-width="2.2"
          stroke-linejoin="round" />
        <path d="M18 6.5 L18 24.5 L27.3 29.6 Z"
          fill="#2F6FE4" opacity="0.95" />
      </svg>`;
    element.addEventListener("click", (event) => event.stopPropagation());
    vehicleMarkerRef.current = new maplibregl.Marker({
      element,
      anchor: "center",
      rotationAlignment: "map",
      pitchAlignment: "map",
    }).setLngLat([point[1], point[0]]).addTo(map);
  }
  vehicleMarkerRef.current.setLngLat([point[1], point[0]]).setRotation(bearing);
  // During playback keep the delivery vehicle pinned to the map centre so the map
  // moves underneath it; paused/manual map navigation remains untouched.
  if (followCamera) map.setCenter([point[1], point[0]]);
}


function renderMarkers(map, points, activePointId, completedPointIds, markersRef, onSelectPointRef) {
  markersRef.current.forEach((marker) => marker.remove());
  markersRef.current = [];
  points.forEach((point, index) => {
    const isCompleted = completedPointIds.some((completedId) => String(completedId) === String(point.id));
    const element = document.createElement("button");
    element.type = "button";
    element.className = `rw-map-marker ${index === 0 ? "is-depot" : "is-stop"} ${activePointId === point.id ? "is-active" : ""} ${isCompleted ? "is-complete" : ""}`;
    element.textContent = index === 0 ? "W" : String(index);
    element.setAttribute("aria-label", index === 0 ? `Warehouse: ${point.name}` : `Delivery stop ${index}: ${point.name}`);
    element.title = point.name;
    element.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelectPointRef.current(point.id);
    });
    markersRef.current.push(
      new maplibregl.Marker({ element, anchor: "bottom" })
        .setLngLat([point.longitude, point.latitude])
        .addTo(map),
    );
  });
}

function Icon({ name, size = 17 }) {
  const shapes = {
    route: (
      <>
        <circle cx="6" cy="19" r="2" />
        <circle cx="18" cy="5" r="2" />
        <path d="M8 19h2a4 4 0 0 0 4-4V9a4 4 0 0 1 4-4" />
      </>
    ),
    plus: (
      <>
        <path d="M12 5v14M5 12h14" />
      </>
    ),
    warehouse: (
      <>
        <path d="m3 10 9-7 9 7v10H3z" />
        <path d="M9 20v-7h6v7" />
      </>
    ),
    pin: (
      <>
        <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5M3 16l9 5 9-5" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    close: <path d="m18 6-12 12M6 6l12 12" />,
    arrow: (
      <>
        <path d="M5 12h14M13 6l6 6-6 6" />
      </>
    ),
    warning: (
      <>
        <path d="M12 3 2.8 20h18.4L12 3Z" />
        <path d="M12 9v4M12 17h.01" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7v5h-5M4 17v-5h5" />
        <path d="M5.6 9A7 7 0 0 1 18 6l2 6M4 12l2 6a7 7 0 0 0 12.4-3" />
      </>
    ),
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {shapes[name] || shapes.route}
    </svg>
  );
}

export default function App() {
  const [points, setPoints] = useState([DEPOT]);
  const [result, setResult] = useState(null);
  const [routeView, setRouteView] = useState("optimal");
  const [originalRoadGeometry, setOriginalRoadGeometry] = useState([]);
  const [roadGeometry, setRoadGeometry] = useState([]);
  const [originalRoadLegs, setOriginalRoadLegs] = useState([]);
  const [roadLegs, setRoadLegs] = useState([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [followMarker, setFollowMarker] = useState(false);
  const [animationProgress, setAnimationProgress] = useState(0);
  const [animationLegIndex, setAnimationLegIndex] = useState(0);
  const [completedStopCount, setCompletedStopCount] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [animationResetKey, setAnimationResetKey] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [backendStatus, setBackendStatus] = useState("Checking");
  const [selectingDepot, setSelectingDepot] = useState(false);
  const [routeWarning, setRouteWarning] = useState("");
  const [fitVersion, setFitVersion] = useState(0);
  const [mapLayer, setMapLayer] = useState("light");
  const [activePointId, setActivePointId] = useState("DEPOT");
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [searchNotice, setSearchNotice] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchFocusedIndex, setSearchFocusedIndex] = useState(-1);
  const searchInputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_URL}/health`)
      .then((r) => {
        if (alive) setBackendStatus(r.ok ? "Connected" : "Unavailable");
      })
      .catch(() => {
        if (alive) setBackendStatus("Offline");
      });
    return () => {
      alive = false;
    };
  }, []);

  // Photon provides place autocomplete without requiring an API key. Debounce
  // keystrokes and cancel stale requests so suggestions stay responsive.
  useEffect(() => {
    const query = searchQuery.trim();
    setSearchError("");
    setSearchFocusedIndex(-1);
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setSearchLoading(true);
      try {
        const depot = points[0] || DEPOT;
        const params = new URLSearchParams({
          q: query,
          limit: "7",
          lat: String(depot.latitude),
          lon: String(depot.longitude),
        });
        const response = await fetch(`https://photon.komoot.io/api/?${params}`, {
          signal: controller.signal,
          headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Location search is temporarily unavailable.");
        const data = await response.json();
        const results = (data.features || []).map((feature, index) => {
          const properties = feature.properties || {};
          const [longitude, latitude] = feature.geometry?.coordinates || [];
          const name = properties.name || properties.street || properties.city || properties.county || "Unnamed place";
          const address = [
            properties.street && properties.name && properties.street !== properties.name ? properties.street : null,
            properties.city || properties.district || properties.county,
            properties.state,
            properties.country,
          ].filter(Boolean).filter((part, partIndex, parts) => parts.indexOf(part) === partIndex).join(", ");
          return {
            id: `${properties.osm_type || "place"}-${properties.osm_id || index}-${latitude}-${longitude}`,
            name,
            address,
            latitude: Number(latitude),
            longitude: Number(longitude),
            category: properties.type || properties.osm_value || "Place",
          };
        }).filter((place) => Number.isFinite(place.latitude) && Number.isFinite(place.longitude));
        setSearchResults(results);
      } catch (error) {
        if (error.name !== "AbortError") {
          setSearchResults([]);
          setSearchError(error.message || "Could not search for locations. Please try again.");
        }
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 350);

    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [searchQuery, points[0]?.latitude, points[0]?.longitude]);

  useEffect(() => {
    function handleSearchShortcut(event) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleSearchShortcut);
    return () => window.removeEventListener("keydown", handleSearchShortcut);
  }, []);

  function resetSimulation() {
    setIsPlaying(false);
    setAnimationProgress(0);
    setAnimationLegIndex(0);
    setCompletedStopCount(0);
    setAnimationResetKey((value) => value + 1);
  }

  function clearResult() {
    setResult(null);
    setOriginalRoadGeometry([]);
    setRoadGeometry([]);
    setOriginalRoadLegs([]);
    setRoadLegs([]);
    resetSimulation();
    setError("");
    setRouteWarning("");
  }

  function handleAnimationProgress({ progress, legIndex, completedCount }) {
    setAnimationProgress(progress);
    setAnimationLegIndex(legIndex);
    setCompletedStopCount((current) => current === completedCount ? current : completedCount);
    const destination = selectedRoute[legIndex + 1];
    if (destination) setActivePointId((current) => current === destination.id ? current : destination.id);
    if (progress >= 1) setIsPlaying(false);
  }

  function togglePlayback() {
    if (!result || routeLegs.length === 0) return;
    if (isPlaying) {
      setIsPlaying(false);
      return;
    }
    if (animationProgress >= 1) {
      setAnimationProgress(0);
      setAnimationLegIndex(0);
      setCompletedStopCount(0);
      setAnimationResetKey((value) => value + 1);
      if (selectedRoute[0]) setActivePointId(selectedRoute[0].id);
    }
    setIsPlaying(true);
  }

  function restartPlayback() {
    setIsPlaying(false);
    setAnimationProgress(0);
    setAnimationLegIndex(0);
    setCompletedStopCount(0);
    setAnimationResetKey((value) => value + 1);
    if (selectedRoute[0]) setActivePointId(selectedRoute[0].id);
  }

  function changeRouteView(view) {
    setRouteView(view);
    resetSimulation();
    if (result) {
      const firstPoint = view === "original" ? result.originalRoute[0] : result.optimizedRoute[0];
      if (firstPoint) setActivePointId(firstPoint.id);
    }
  }

  function addLocation(latlng) {
    if (selectingDepot) {
      setPoints((current) =>
        current.map((p, i) =>
          i === 0
            ? {
                ...p,
                latitude: +latlng.lat.toFixed(6),
                longitude: +latlng.lng.toFixed(6),
              }
            : p,
        ),
      );
      setSelectingDepot(false);
      setActivePointId("DEPOT");
      clearResult();
      return;
    }
    const p = {
      id: `STOP-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: `Delivery ${points.length}`,
      latitude: +latlng.lat.toFixed(6),
      longitude: +latlng.lng.toFixed(6),
    };
    setPoints((current) => [...current, p]);
    setActivePointId(p.id);
    clearResult();
  }

  function selectSearchResult(place) {
    const duplicate = points.find((point) =>
      haversineDistance(
        [point.latitude, point.longitude],
        [place.latitude, place.longitude],
      ) < 80,
    );
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSearchError("");
    setSearchNotice("");
    setSearchFocusedIndex(-1);
    setSelectingDepot(false);

    if (duplicate) {
      setActivePointId(duplicate.id);
      window.dispatchEvent(new CustomEvent("routewise-focus-point", {
        detail: { latitude: duplicate.latitude, longitude: duplicate.longitude },
      }));
      setSearchNotice(`“${duplicate.name}” is already on your route.`);
      return;
    }

    const point = {
      id: `STOP-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: place.name,
      latitude: +place.latitude.toFixed(6),
      longitude: +place.longitude.toFixed(6),
    };
    setPoints((current) => [...current, point]);
    setActivePointId(point.id);
    clearResult();
    window.dispatchEvent(new CustomEvent("routewise-focus-point", {
      detail: { latitude: point.latitude, longitude: point.longitude },
    }));
  }

  function handleSearchKeyDown(event) {
    if (event.key === "Escape") {
      setSearchOpen(false);
      setSearchFocusedIndex(-1);
      searchInputRef.current?.blur();
      return;
    }
    if (event.key === "ArrowDown" && searchResults.length) {
      event.preventDefault();
      setSearchOpen(true);
      setSearchFocusedIndex((index) => (index + 1) % searchResults.length);
    } else if (event.key === "ArrowUp" && searchResults.length) {
      event.preventDefault();
      setSearchOpen(true);
      setSearchFocusedIndex((index) => index <= 0 ? searchResults.length - 1 : index - 1);
    } else if (event.key === "Enter" && searchResults.length) {
      event.preventDefault();
      const index = searchFocusedIndex >= 0 ? searchFocusedIndex : 0;
      selectSearchResult(searchResults[index]);
    }
  }

  function removeLocation(id) {
    setPoints((current) => current.filter((p) => p.id !== id));
    if (activePointId === id) setActivePointId(null);
    clearResult();
  }

  function renameLocation(id, name) {
    setPoints((current) =>
      current.map((p) => (p.id === id ? { ...p, name } : p)),
    );
    clearResult();
  }

  async function optimizeRoute() {
    if (points.length < 2) {
      setError("Add at least one delivery stop to optimize a route.");
      return;
    }
    setLoading(true);
    setError("");
    setRouteWarning("");
    setResult(null);
    setRoadGeometry([]);
    setOriginalRoadGeometry([]);
    setRoadLegs([]);
    setOriginalRoadLegs([]);
    resetSimulation();
    setRouteView("optimal");
    let response;
    try {
      response = await fetch(`${API_URL}/routes/optimize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ points }),
      });
    } catch {
      setBackendStatus("Offline");
      setError(
        "Could not connect to RouteWise. Check that the Spring Boot backend is running.",
      );
      setLoading(false);
      return;
    }
    setBackendStatus("Connected");
    if (!response.ok) {
      setError(
        `Route optimization failed (HTTP ${response.status}). Check the locations and try again.`,
      );
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
      setError("The backend response did not include a valid route.");
      setLoading(false);
      return;
    }
    setResult(data);
    setFitVersion((v) => v + 1);
    const [original, optimized] = await Promise.allSettled([
      fetchRoadRoute(data.originalRoute),
      fetchRoadRoute(data.optimizedRoute),
    ]);
    if (original.status === "fulfilled") {
      setOriginalRoadGeometry(original.value.geometry);
      setOriginalRoadLegs(original.value.legs);
    }
    if (optimized.status === "fulfilled") {
      setRoadGeometry(optimized.value.geometry);
      setRoadLegs(optimized.value.legs);
    }
    if (original.status === "rejected" && optimized.status === "rejected")
      setRouteWarning(
        "Road directions are unavailable. The simulation will use straight map segments.",
      );
    else if (original.status === "rejected")
      setRouteWarning(
        "Original road geometry is unavailable; its simulation uses straight map segments.",
      );
    else if (optimized.status === "rejected")
      setRouteWarning(
        "Optimized road geometry is unavailable; its simulation uses straight map segments.",
      );
    setLoading(false);
  }

  const boundsPoints = useMemo(
    () => points.map((p) => [p.latitude, p.longitude]),
    [points],
  );
  const center = useMemo(
    () => [points[0].latitude, points[0].longitude],
    [points[0].latitude, points[0].longitude],
  );
  const selectedRoute = useMemo(
    () => result
      ? routeView === "original" ? result.originalRoute : result.optimizedRoute
      : [],
    [result, routeView],
  );
  const geometry = routeView === "original" ? originalRoadGeometry : roadGeometry;
  const routePositions = geometry.length
    ? geometry
    : selectedRoute.map((p) => [p.latitude, p.longitude]);
  const routeLegs = useMemo(() => {
    const roadLegsForView = routeView === "original" ? originalRoadLegs : roadLegs;
    if (roadLegsForView.length) return roadLegsForView;
    return selectedRoute.slice(0, -1).map((point, index) => [
      [point.latitude, point.longitude],
      [selectedRoute[index + 1].latitude, selectedRoute[index + 1].longitude],
    ]);
  }, [routeView, originalRoadLegs, roadLegs, selectedRoute]);
  const completedPointIds = useMemo(
    () => selectedRoute.slice(1, completedStopCount + 1)
      .filter((point) => point.id !== "DEPOT")
      .map((point) => point.id),
    [selectedRoute, completedStopCount],
  );
  const currentDestination = selectedRoute[Math.min(animationLegIndex + 1, Math.max(selectedRoute.length - 1, 0))];
  const distanceSaved = result?.distanceSavedKm ?? 0;
  const savingPercent =
    result && result.originalDistanceKm > 0
      ? (distanceSaved / result.originalDistanceKm) * 100
      : 0;

  function focusPoint(point) {
    setActivePointId(point.id);
    window.dispatchEvent(
      new CustomEvent("routewise-focus-point", {
        detail: { latitude: point.latitude, longitude: point.longitude },
      }),
    );
  }

  return (
    <main className="rw-app">
      <header className="rw-topbar">
        <a className="rw-brand" href="#" aria-label="RouteWise home">
          <span className="rw-brand-mark">
            <Icon name="route" size={20} />
          </span>
          <span className="rw-brand-word">routewise</span>
          <span className="rw-brand-divider" />
          <span className="rw-product-label">Operations</span>
        </a>
        <div className="rw-topbar-right">
          <span
            className={`rw-status ${backendStatus === "Connected" ? "is-online" : ["Offline", "Unavailable"].includes(backendStatus) ? "is-offline" : ""}`}
          >
            <span className="rw-status-dot" />
            {backendStatus === "Connected"
              ? "System operational"
              : backendStatus === "Checking"
                ? "Checking system"
                : `Backend ${backendStatus.toLowerCase()}`}
          </span>
          <span className="rw-topbar-separator" />
          <span className="rw-avatar">RW</span>
        </div>
      </header>

      <div className="rw-page-heading">
        <div>
          <div className="rw-breadcrumb">
            WORKSPACE <span>/</span> ROUTE PLANNING
          </div>
          <h1>Plan your delivery route</h1>
          <p>
            Build a delivery tour, optimize the stop order, and review your
            route.
          </p>
        </div>
        <div className="rw-heading-meta">
          <span className="rw-live-indicator" />
          Vashi, Navi Mumbai
        </div>
      </div>

      <div className="rw-workspace">
        <aside className="rw-planner">
          <div className="rw-panel-heading">
            <div>
              <div className="rw-panel-kicker">ROUTE SETUP</div>
              <h2>Delivery tour</h2>
            </div>
            <span className="rw-count">
              {Math.max(points.length - 1, 0)} stops
            </span>
          </div>
          <div className="rw-stop-list">
            {points.map((point, index) => (
              <article
                key={point.id}
                className={`rw-stop ${index === 0 ? "rw-stop-depot" : ""} ${activePointId === point.id ? "is-active" : ""}`}
                onClick={() => focusPoint(point)}
              >
                <div
                  className={`rw-stop-marker ${index === 0 ? "is-depot" : ""}`}
                >
                  {index === 0 ? <Icon name="warehouse" size={17} /> : index}
                </div>
                <div className="rw-stop-fields">
                  <div className="rw-stop-type">
                    {index === 0
                      ? "START & RETURN"
                      : `DELIVERY STOP ${String(index).padStart(2, "0")}`}
                  </div>
                  <input
                    className="rw-stop-name"
                    aria-label={`${index === 0 ? "Depot" : "Stop"} name`}
                    value={point.name}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => renameLocation(point.id, e.target.value)}
                  />
                  <span className="rw-stop-coords">
                    {point.latitude.toFixed(4)}, {point.longitude.toFixed(4)}
                  </span>
                </div>
                <div className="rw-stop-actions">
                  {index === 0 ? (
                    <button
                      className={`rw-icon-button ${selectingDepot ? "is-selected" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectingDepot((v) => !v);
                      }}
                      title="Choose depot on map"
                      aria-label="Choose depot on map"
                      aria-pressed={selectingDepot}
                    >
                      <Icon name="pin" size={16} />
                    </button>
                  ) : (
                    <button
                      className="rw-icon-button rw-remove-button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeLocation(point.id);
                      }}
                      aria-label={`Remove ${point.name}`}
                      title="Remove stop"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
          <div className={`rw-map-hint ${selectingDepot ? "is-picking" : ""}`}>
            <span className="rw-hint-icon">
              <Icon name={selectingDepot ? "pin" : "plus"} size={15} />
            </span>
            <div>
              <strong>
                {selectingDepot
                  ? "Choose a new depot location"
                  : "Add a delivery stop"}
              </strong>
              <span>
                {selectingDepot
                  ? "Click the map to move the warehouse."
                  : "Click anywhere on the map to add a stop."}
              </span>
            </div>
            {selectingDepot && (
              <button
                onClick={() => setSelectingDepot(false)}
                aria-label="Cancel depot selection"
              >
                <Icon name="close" size={15} />
              </button>
            )}
          </div>
          <div className="rw-planner-footer">
            {error && (
              <div className="rw-message rw-message-error" role="alert">
                <Icon name="warning" size={17} />
                <span>{error}</span>
              </div>
            )}
            <button
              className="rw-optimize-button"
              onClick={optimizeRoute}
              disabled={loading || points.length < 2}
            >
              {loading ? (
                <span className="rw-spinner" />
              ) : (
                <Icon name="route" size={18} />
              )}
              <span>
                {loading ? "Optimizing your route…" : "Optimize delivery route"}
              </span>
              {!loading && <Icon name="arrow" size={17} />}
            </button>
            <div className="rw-algorithm-note">
              <span className="rw-note-dot" />
              Powered by the RouteWise optimization engine
            </div>
          </div>
        </aside>

        <section className="rw-map-column">
          <div className="rw-map-toolbar">
            <div className="rw-map-title">
              <h2>Route map</h2>
              <span className="rw-map-subtitle">
                {points.length} locations ·{" "}
                {result ? "Route calculated" : "Ready to plan"} · 3D city view
              </span>
            </div>
            <div className="rw-map-toolbar-actions">
              {result && (
                <div
                  className="rw-route-switch"
                  role="group"
                  aria-label="Choose route to display"
                >
                  <button
                    className={routeView === "original" ? "is-active" : ""}
                    onClick={() => changeRouteView("original")}
                  >
                    Original
                  </button>
                  <button
                    className={routeView === "optimal" ? "is-active" : ""}
                    onClick={() => changeRouteView("optimal")}
                  >
                    Optimized
                  </button>
                </div>
              )}
              <button
                className="rw-map-control"
                onClick={() => setFitVersion((v) => v + 1)}
                title="Fit all stops"
                aria-label="Fit all stops"
              >
                <Icon name="layers" size={17} />
              </button>
              <button
                className={`rw-map-control ${mapLayer === "standard" ? "is-active" : ""}`}
                onClick={() =>
                  setMapLayer((v) => (v === "light" ? "standard" : "light"))
                }
                title="Toggle map style"
                aria-label="Toggle map style"
              >
                <Icon name="layers" size={17} />
              </button>
            </div>
          </div>
          <div className="rw-location-search">
            <div className={`rw-search-box ${searchOpen ? "is-open" : ""}`}>
              <svg className="rw-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.8" stroke="currentColor" strokeWidth="1.8" />
                <path d="m16 16 4.2 4.2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
              <input
                ref={searchInputRef}
                className="rw-location-search-input"
                type="search"
                value={searchQuery}
                placeholder="Search a place, address, or landmark…"
                aria-label="Search for a delivery location"
                aria-autocomplete="list"
                aria-expanded={searchOpen && searchQuery.trim().length >= 2}
                aria-controls="rw-location-suggestions"
                onFocus={() => setSearchOpen(true)}
                onBlur={() => window.setTimeout(() => setSearchOpen(false), 160)}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchOpen(true);
                  setSearchError("");
                  setSearchNotice("");
                }}
                onKeyDown={handleSearchKeyDown}
              />
              {searchLoading ? <span className="rw-search-spinner" aria-label="Searching" /> : searchQuery ? (
                <button className="rw-search-clear" type="button" aria-label="Clear search" onClick={() => {
                  setSearchQuery(""); setSearchResults([]); setSearchError(""); setSearchNotice(""); setSearchOpen(true); searchInputRef.current?.focus();
                }}><Icon name="close" size={15} /></button>
              ) : <span className="rw-search-shortcut">⌘ K</span>}
            </div>
            {searchOpen && searchQuery.trim().length >= 2 && (
              <div className="rw-search-suggestions" id="rw-location-suggestions" role="listbox" aria-label="Location suggestions">
                {searchLoading && searchResults.length === 0 ? (
                  <div className="rw-search-feedback"><span className="rw-spinner" /> Searching places…</div>
                ) : searchError ? (
                  <div className="rw-search-feedback is-error">{searchError}</div>
                ) : searchResults.length ? searchResults.map((place, index) => (
                  <button
                    key={place.id}
                    type="button"
                    role="option"
                    aria-selected={searchFocusedIndex === index}
                    className={`rw-search-result ${searchFocusedIndex === index ? "is-highlighted" : ""}`}
                    onMouseEnter={() => setSearchFocusedIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => selectSearchResult(place)}
                  >
                    <span className="rw-search-result-pin"><Icon name="pin" size={16} /></span>
                    <span className="rw-search-result-copy">
                      <strong>{place.name}</strong>
                      <span>{place.address || place.category}</span>
                    </span>
                    <span className="rw-search-add">Add stop</span>
                  </button>
                )) : (
                  <div className="rw-search-feedback">No matching places found. Try a nearby landmark or full address.</div>
                )}
                <div className="rw-search-attribution">Location results by OpenStreetMap contributors · Photon</div>
              </div>
            )}
            {(searchNotice || (searchError && !searchOpen)) && <div className="rw-search-inline-message">{searchNotice || searchError}</div>}
            <span className="rw-search-helper">Search any address or landmark, then select a result to add it as a stop.</span>
          </div>
          <div className="rw-map-frame">
            <MapWorkspace
              points={points}
              routePositions={routePositions}
              routeLegs={routeLegs}
              routeView={routeView}
              activePointId={activePointId}
              completedPointIds={completedPointIds}
              selectingDepot={selectingDepot}
              mapLayer={mapLayer}
              fitVersion={fitVersion}
              center={center}
              isPlaying={isPlaying}
              followMarker={followMarker}
              animationProgress={animationProgress}
              playbackSpeed={playbackSpeed}
              animationResetKey={animationResetKey}
              onAnimationProgress={handleAnimationProgress}
              onMapClick={addLocation}
              onSelectPoint={setActivePointId}
            />
            <div className="rw-map-interaction-hint">
              <Icon name={selectingDepot ? "pin" : "plus"} size={15} />
              {selectingDepot
                ? "Click map to set depot"
                : "Click map to add stop"}
            </div>
            <div className="rw-map-bottom-left">
              <span className="rw-map-key">
                <i className="rw-key-depot" />
                Depot
              </span>
              <span className="rw-map-key">
                <i className="rw-key-stop" />
                Pending stop
              </span>
              <span className="rw-map-key">
                <i className="rw-key-complete" />
                Delivered
              </span>
              {result && (
                <span className="rw-map-key">
                  <i
                    className={`rw-key-route ${routeView === "original" ? "is-original" : ""}`}
                  />
                  {routeView === "original"
                    ? "Original route"
                    : "Optimized route"}
                </span>
              )}
            </div>
            {result && (
              <div className="rw-map-success">
                <span>
                  <Icon name="check" size={14} />
                </span>
                Route optimized
              </div>
            )}
            {loading && (
              <div className="rw-map-loading">
                <span className="rw-spinner" />
                Calculating the most efficient tour…
              </div>
            )}
          </div>
          {result && routeLegs.length > 0 && (
            <section className="rw-simulation-panel" aria-label="Route playback controls">
              <div className="rw-simulation-topline">
                <span className={`rw-simulation-status ${isPlaying ? "is-live" : ""}`}>
                  <i />
                  {isPlaying ? "LIVE SIMULATION" : animationProgress >= 1 ? "TOUR COMPLETED" : "ROUTE SIMULATION"}
                </span>
                <span className="rw-simulation-speed">{playbackSpeed}×</span>
              </div>
              <div className="rw-simulation-destination">
                <span className="rw-simulation-car">↗</span>
                <span>
                  <strong>
                    {animationProgress >= 1
                      ? "Returned to warehouse"
                      : isPlaying
                        ? `En route to ${currentDestination?.name || "next stop"}`
                        : animationProgress > 0
                          ? `Paused · ${currentDestination?.name || "next stop"}`
                          : "Ready to depart"}
                  </strong>
                  <small>
                    {completedStopCount} of {Math.max(selectedRoute.length - 2, 0)} deliveries completed
                  </small>
                </span>
              </div>
              <div className="rw-follow-row">
                <span className="rw-follow-copy">
                  <strong>Keep marker in focus</strong>
                  <small>Pan the map with the moving arrow</small>
                </span>
                <button
                  type="button"
                  className={`rw-follow-toggle ${followMarker ? "is-on" : ""}`}
                  role="switch"
                  aria-checked={followMarker}
                  aria-label="Keep moving marker centered during playback"
                  title={followMarker ? "Turn off camera follow" : "Keep the moving marker centered"}
                  onClick={() => setFollowMarker((value) => !value)}
                >
                  <span />
                </button>
              </div>
              <div
                className="rw-simulation-progress"
                role="progressbar"
                aria-label="Route simulation progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(animationProgress * 100)}
              >
                <span style={{ width: `${Math.round(animationProgress * 100)}%` }} />
              </div>
              <div className="rw-simulation-actions">
                <button
                  className="rw-sim-primary"
                  onClick={togglePlayback}
                  aria-label={isPlaying ? "Pause route simulation" : animationProgress >= 1 ? "Replay route simulation" : "Play route simulation"}
                >
                  {isPlaying ? "Ⅱ" : "▶"}
                  <span>{isPlaying ? "Pause" : animationProgress >= 1 ? "Replay" : "Play tour"}</span>
                </button>
                <button
                  className="rw-sim-secondary"
                  onClick={restartPlayback}
                  title="Restart simulation"
                  aria-label="Restart simulation"
                >
                  ↺
                </button>
                <button
                  className="rw-sim-secondary rw-sim-speed"
                  onClick={() => setPlaybackSpeed((speed) => speed === 1 ? 1.5 : speed === 1.5 ? 2 : 1)}
                  title="Change playback speed"
                  aria-label="Change playback speed"
                >
                  {playbackSpeed}×
                </button>
              </div>
            </section>
          )}

          {routeWarning && (
            <div className="rw-message rw-message-warning" role="status">
              <Icon name="warning" size={16} />
              <span>{routeWarning}</span>
            </div>
          )}

          <section className="rw-results">
            <button
              className="rw-results-heading"
              onClick={() => setShowAnalytics((v) => !v)}
              aria-expanded={showAnalytics}
            >
              <span>
                <span className="rw-panel-kicker">ROUTE PERFORMANCE</span>
                <strong>
                  {result ? "Route summary" : "Your route at a glance"}
                </strong>
              </span>
              <span className="rw-results-heading-right">
                {result && (
                  <span className="rw-savings-pill">
                    {savingPercent.toFixed(1)}% shorter
                  </span>
                )}
                <Icon name="chevron" size={18} />
              </span>
            </button>
            {showAnalytics && (
              <>
                <div className="rw-metrics">
                  <article className="rw-metric">
                    <span className="rw-metric-label">Delivery stops</span>
                    <strong>{Math.max(points.length - 1, 0)}</strong>
                    <span className="rw-metric-foot">Customer locations</span>
                  </article>
                  <article className="rw-metric">
                    <span className="rw-metric-label">Original distance</span>
                    <strong>
                      {result ? (
                        <>
                          {result.originalDistanceKm.toFixed(2)}{" "}
                          <small>km</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </strong>
                    <span className="rw-metric-foot">Initial stop order</span>
                  </article>
                  <article className="rw-metric">
                    <span className="rw-metric-label">Optimized distance</span>
                    <strong>
                      {result ? (
                        <>
                          {result.optimizedDistanceKm.toFixed(2)}{" "}
                          <small>km</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </strong>
                    <span className="rw-metric-foot">
                      Calculated by Java TSP
                    </span>
                  </article>
                  <article className="rw-metric rw-metric-saved">
                    <span className="rw-metric-label">Distance saved</span>
                    <strong>
                      {result ? (
                        <>
                          {distanceSaved.toFixed(2)} <small>km</small>
                        </>
                      ) : (
                        "—"
                      )}
                    </strong>
                    <span className="rw-metric-foot">
                      {result ? "Estimated reduction" : "After optimization"}
                    </span>
                  </article>
                </div>
                {result && (
                  <div className="rw-sequence">
                    <div className="rw-sequence-heading">
                      <div>
                        <strong>
                          {routeView === "original"
                            ? "Original stop sequence"
                            : "Optimized stop sequence"}
                        </strong>
                        <span>
                          {selectedRoute.length} route points, including depot
                          return
                        </span>
                      </div>
                      <button
                        className="rw-text-button"
                        onClick={() => setFitVersion((v) => v + 1)}
                      >
                        View all stops
                      </button>
                    </div>
                    <div className="rw-sequence-track">
                      {selectedRoute.map((point, index, sequence) => (
                        <div
                          className="rw-sequence-item"
                          key={`${point.id}-${index}`}
                        >
                          <span
                            className={`rw-sequence-marker ${index === 0 ? "is-start" : index === sequence.length - 1 ? "is-return" : ""}`}
                          >
                            {index === 0 ? (
                              <Icon name="warehouse" size={14} />
                            ) : index === sequence.length - 1 ? (
                              <Icon name="refresh" size={14} />
                            ) : (
                              index
                            )}
                          </span>
                          <span className="rw-sequence-name">{point.name}</span>
                          {index === 0 && (
                            <span className="rw-sequence-tag">START</span>
                          )}
                          {index === sequence.length - 1 && (
                            <span className="rw-sequence-tag">RETURN</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <p className="rw-distance-note">
                  Distances are calculated by the Java optimizer using
                  straight-line Haversine distances. Road geometry is supplied
                  by OSRM when available, so displayed roads may differ from the
                  optimizer's distance estimate.
                </p>
              </>
            )}
          </section>
        </section>
      </div>
      <footer className="rw-footer">
        <span>
          RouteWise <i>·</i> Delivery operations workspace
        </span>
        <span>
          Route optimization <i>·</i> Java backend
        </span>
      </footer>
    </main>
  );
}
