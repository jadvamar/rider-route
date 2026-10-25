import { Fragment, useEffect, useMemo } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "@/types";
import type { RouteOption } from "@/services/routingService";
import { formatRouteDuration } from "@/services/routingService";

const startIcon = L.divIcon({
  className: "route-option-endpoint",
  html: '<div style="width:22px;height:22px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div>',
  iconSize: [22, 22],
  iconAnchor: [11, 11],
});

const destIcon = L.divIcon({
  className: "route-option-endpoint",
  html: '<div style="width:24px;height:24px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#dc2626;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.45)"></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 22],
});

function labelIcon(text: string, selected: boolean) {
  const bg = selected ? "#1a73e8" : "#ffffff";
  const fg = selected ? "#ffffff" : "#1f2937";
  const border = selected ? "#1a73e8" : "#9ca3af";
  return L.divIcon({
    className: "route-option-label",
    html: `<div style="transform:translate(-50%,-50%);display:inline-block;white-space:nowrap;padding:4px 10px;border-radius:8px;background:${bg};color:${fg};border:2px solid ${border};font:700 13px Inter,'Segoe UI',Roboto,Arial,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.35);cursor:pointer">${text}</div>`,
    iconSize: [0, 0],
  });
}

// Spread labels along different parts of each route so they do not stack.
function labelPoint(geometry: LatLng[], index: number): LatLng {
  const fraction = [0.5, 0.35, 0.65][index % 3];
  return geometry[Math.min(geometry.length - 1, Math.floor(geometry.length * fraction))];
}

function FitAll({ points }: { points: L.LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length > 1) map.fitBounds(L.latLngBounds(points), { padding: [36, 36] });
    else if (points.length === 1) map.setView(points[0], 13);
  }, [map, points]);
  return null;
}

interface RouteOptionsMapProps {
  routes: RouteOption[];
  selectedIndex: number | null;
  onSelect: (index: number) => void;
  start?: LatLng | null;
  destination?: LatLng | null;
}

export default function RouteOptionsMap({ routes, selectedIndex, onSelect, start, destination }: RouteOptionsMapProps) {
  const lines = useMemo(
    () => routes.map((r) => r.geometry.map((p) => [p.lat, p.lng] as L.LatLngTuple)),
    [routes],
  );
  const boundsPoints = useMemo(() => {
    const pts = lines.flat();
    if (start) pts.push([start.lat, start.lng]);
    if (destination) pts.push([destination.lat, destination.lng]);
    return pts;
  }, [lines, start, destination]);

  if (boundsPoints.length === 0) return null;

  // Draw unselected routes first so the selected one sits on top.
  const order = routes.map((_, i) => i).sort((a, b) => Number(a === selectedIndex) - Number(b === selectedIndex));
  const fastest = routes.length ? Math.min(...routes.map((r) => r.duration)) : 0;

  return (
    <div className="w-full h-72 rounded-xl overflow-hidden border border-border" data-testid="route-options-map">
      <MapContainer center={boundsPoints[0]} zoom={12} className="w-full h-full z-0" zoomControl={false}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitAll points={boundsPoints} />

        {order.map((i) => {
          const selected = i === selectedIndex;
          const select = { click: () => onSelect(i) };
          return (
            <Fragment key={`route-${i}`}>
              <Polyline
                positions={lines[i]}
                pathOptions={{ color: selected ? "#0b57d0" : "#6b7280", weight: selected ? 10 : 8, opacity: selected ? 0.55 : 0.6, lineCap: "round", lineJoin: "round" }}
                eventHandlers={select}
              />
              <Polyline
                positions={lines[i]}
                pathOptions={{ color: selected ? "#4285f4" : "#bdc1c6", weight: selected ? 6 : 5, opacity: 1, lineCap: "round", lineJoin: "round" }}
                eventHandlers={select}
              />
              {/* Wide transparent line makes thin routes easy to tap */}
              <Polyline positions={lines[i]} pathOptions={{ color: "#000", weight: 22, opacity: 0.01 }} eventHandlers={select} />
            </Fragment>
          );
        })}

        {routes.map((route, i) => {
          const at = labelPoint(route.geometry, i);
          if (!at) return null;
          const extra = Math.round((route.duration - fastest) / 60);
          const text = extra <= 0 ? formatRouteDuration(route.duration) : `${formatRouteDuration(route.duration)} · +${extra} min`;
          return (
            <Marker
              key={`label-${i}`}
              position={[at.lat, at.lng]}
              icon={labelIcon(text, i === selectedIndex)}
              zIndexOffset={i === selectedIndex ? 1000 : 500}
              eventHandlers={{ click: () => onSelect(i) }}
            />
          );
        })}

        {start && <Marker position={[start.lat, start.lng]} icon={startIcon} zIndexOffset={1500} />}
        {destination && <Marker position={[destination.lat, destination.lng]} icon={destIcon} zIndexOffset={1500} />}
      </MapContainer>
    </div>
  );
}
