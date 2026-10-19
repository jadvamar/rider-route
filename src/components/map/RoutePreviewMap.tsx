import { useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/types";

function createPointIcon(label: string, color: string) {
  return L.divIcon({
    className: "route-preview-marker",
    html: `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:12px;color:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.4);">${label}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const startIcon = createPointIcon("A", "#22c55e");
const destIcon = createPointIcon("B", "#ef4444");

function isValid(p?: LatLng | null): p is LatLng {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng);
}

function FitBounds({ points }: { points: L.LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView(points[0], 13);
    } else {
      map.fitBounds(L.latLngBounds(points), { padding: [24, 24] });
    }
  }, [map, points]);
  return null;
}

interface RoutePreviewMapProps {
  start?: LatLng | null;
  destination?: LatLng | null;
  route?: LatLng[] | null;
}

export default function RoutePreviewMap({ start, destination, route }: RoutePreviewMapProps) {
  const routePoints = useMemo(
    () => (route || []).filter(isValid).map((p) => [p.lat, p.lng] as L.LatLngTuple),
    [route],
  );

  const boundsPoints = useMemo(() => {
    const pts = [...routePoints];
    if (isValid(start)) pts.push([start.lat, start.lng]);
    if (isValid(destination)) pts.push([destination.lat, destination.lng]);
    return pts;
  }, [routePoints, start, destination]);

  if (boundsPoints.length === 0) return null;

  return (
    <div className="w-full h-56 rounded-xl overflow-hidden border border-border" data-testid="route-preview-map">
      <MapContainer
        center={boundsPoints[0]}
        zoom={13}
        className="w-full h-full z-0"
        zoomControl={false}
        attributionControl={false}
      >
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <FitBounds points={boundsPoints} />
        {routePoints.length > 1 && (
          <>
            <Polyline positions={routePoints} pathOptions={{ color: "#1a73e8", weight: 8, opacity: 0.4 }} />
            <Polyline positions={routePoints} pathOptions={{ color: "#4285F4", weight: 5, opacity: 1 }} />
          </>
        )}
        {isValid(start) && <Marker position={[start.lat, start.lng]} icon={startIcon} />}
        {isValid(destination) && <Marker position={[destination.lat, destination.lng]} icon={destIcon} />}
      </MapContainer>
    </div>
  );
}
