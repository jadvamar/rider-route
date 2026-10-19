import { useEffect, useRef, useState, useCallback, memo } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { RiderSession, LatLng } from "@/types";
import {
  formatDistance,
  formatETA,
  getDistance,
  getETA,
} from "@/services/locationService";

// Fix default marker icons
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)
  ._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl:
    "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function createRiderIcon(
  name: string,
  isLeader: boolean,
  isOnRoute: boolean,
  isMe: boolean,
) {
  const color = isMe
    ? "#00bfff"
    : isLeader
      ? "#f59e0b"
      : isOnRoute
        ? "#22c55e"
        : "#ef4444";
  const initial = name.charAt(0).toUpperCase();
  return L.divIcon({
    className: "custom-rider-marker",
    html: `
      <div style="position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="width:36px;height:36px;border-radius:50%;background:${color};border:3px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:14px;color:#fff;box-shadow:0 2px 8px rgba(0,0,0,0.4);">
          ${initial}
        </div>
        ${!isOnRoute ? '<div style="position:absolute;top:-4px;right:-4px;width:12px;height:12px;background:#ef4444;border-radius:50%;border:2px solid #fff;"></div>' : ""}
        <div style="position:absolute;bottom:-18px;white-space:nowrap;font-size:10px;font-weight:600;color:#fff;background:rgba(0,0,0,0.7);padding:1px 6px;border-radius:4px;">${name}${isLeader ? " ★" : ""}</div>
      </div>
    `,
    iconSize: [36, 50],
    iconAnchor: [18, 18],
  });
}

function MapUpdater({ center }: { center: LatLng }) {
  const map = useMap();
  const initialized = useRef(false);
  useEffect(() => {
    if (
      !initialized.current &&
      center &&
      typeof center.lat === "number" &&
      typeof center.lng === "number"
    ) {
      map.setView([center.lat, center.lng], 14);
      initialized.current = true;
    }
  }, [center, map]);
  return null;
}

interface RideMapProps {
  riders: RiderSession[];
  myUserId: string;
  route: LatLng[];
  center: LatLng;
  onRiderClick?: (rider: RiderSession) => void;
}

export default function RideMap({
  riders,
  myUserId,
  route,
  center,
  onRiderClick,
}: RideMapProps) {
  const [selectedRider, setSelectedRider] = useState<RiderSession | null>(null);
  const myLocation = riders.find((r) => r.userId === myUserId)?.location;
  
  // Debug logging
  useEffect(() => {
    console.log('🚴 RideMap riders:', riders.map(r => ({ name: r.userName, location: r.location, isMe: r.userId === myUserId })));
    console.log('📌 Map center:', center);
  }, [riders, center, myUserId]);

  const handleRiderClick = useCallback(
    (rider: RiderSession) => {
      setSelectedRider(rider);
      onRiderClick?.(rider);
    },
    [onRiderClick],
  );

  // Validate center coordinates, fallback to default location
  const validCenter =
    center && typeof center.lat === "number" && typeof center.lng === "number"
      ? ([center.lat, center.lng] as [number, number])
      : ([40.7128, -74.006] as [number, number]); // Default to NYC

  return (
    <div className="w-full h-full relative bg-background">
      <MapContainer
        center={validCenter}
        zoom={14}
        className="w-full h-full z-0"
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapUpdater center={center} />

        {/* Route polyline — Google Maps style with border + fill */}
        {route.length > 1 && (
          <>
            {/* Dark border/outline */}
            <Polyline
              positions={route.map((p) => [p.lat, p.lng] as L.LatLngTuple)}
              pathOptions={{
                color: "#1a73e8",
                weight: 8,
                opacity: 0.4,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
            {/* Bright blue fill */}
            <Polyline
              positions={route.map((p) => [p.lat, p.lng] as L.LatLngTuple)}
              pathOptions={{
                color: "#4285F4",
                weight: 5,
                opacity: 1,
                lineCap: "round",
                lineJoin: "round",
              }}
            />
          </>
        )}

        {/* Rider markers */}
        {riders.map((rider) => {
          const isMe = rider.userId === myUserId;
          return (
            <Marker
              key={rider.userId}
              position={[rider.location.lat, rider.location.lng]}
              icon={createRiderIcon(
                rider.userName,
                rider.isLeader,
                rider.isOnRoute,
                isMe,
              )}
              eventHandlers={{ click: () => handleRiderClick(rider) }}
            >
              <Popup className="dark-popup">
                <div className="text-sm font-semibold">
                  {rider.userName} {rider.isLeader && "★"}
                </div>
                <div className="text-xs opacity-70">
                  {Math.round(rider.speed)} km/h
                </div>
                {myLocation && !isMe && (
                  <div className="text-xs mt-1">
                    {formatDistance(getDistance(myLocation, rider.location))}{" "}
                    away
                    <br />
                    ETA:{" "}
                    {formatETA(
                      getETA(
                        getDistance(myLocation, rider.location),
                        rider.speed,
                      ),
                    )}
                  </div>
                )}
                {!rider.isOnRoute && (
                  <div
                    className="text-xs mt-1 font-semibold"
                    style={{ color: "#ef4444" }}
                  >
                    Off route!
                  </div>
                )}
              </Popup>
            </Marker>
          );
        })}

        {/* Rider trail polylines */}
        {riders.map((rider) => {
          if (rider.routeFollowed.length < 2) return null;
          const isMe = rider.userId === myUserId;
          return (
            <Polyline
              key={`trail-${rider.userId}`}
              positions={rider.routeFollowed
                .slice(-30)
                .map((p) => [p.lat, p.lng] as L.LatLngTuple)}
              pathOptions={{
                color: isMe
                  ? "#00bfff"
                  : rider.isLeader
                    ? "#f59e0b"
                    : "#22c55e",
                weight: 2,
                opacity: 0.4,
              }}
            />
          );
        })}
      </MapContainer>

      {/* Selected rider info panel */}
      {selectedRider && myLocation && selectedRider.userId !== myUserId && (
        <div className="absolute bottom-4 left-4 right-4 glass-strong rounded-xl p-4 animate-slide-up z-[1000]">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-foreground">
                {selectedRider.userName} {selectedRider.isLeader && "★"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {formatDistance(
                  getDistance(myLocation, selectedRider.location),
                )}{" "}
                away · ETA{" "}
                {formatETA(
                  getETA(
                    getDistance(myLocation, selectedRider.location),
                    selectedRider.speed,
                  ),
                )}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Speed: {Math.round(selectedRider.speed)} km/h
                {!selectedRider.isOnRoute && (
                  <span className="text-destructive font-semibold ml-2">
                    OFF ROUTE
                  </span>
                )}
              </p>
            </div>
            <button
              onClick={() => setSelectedRider(null)}
              className="text-muted-foreground hover:text-foreground p-2"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
