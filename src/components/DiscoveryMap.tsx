// src/components/DiscoveryMap.tsx
'use client';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import Link from 'next/link';

const markerIcon = L.icon({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

interface PinBarber {
  _id: string;
  name: string;
  slug: string;
  imageUrl?: string;
}

interface Pin {
  _id: string;
  name: string;
  slug: string;
  lat: number;
  lng: number;
  barbers?: PinBarber[];
}

// `center` is the visitor's own geolocated position (from "Near me") — when
// present it gets its own "You are here" pin and the map centers there at a
// fixed zoom. Without it (the default map view, no permission asked), the
// map instead fits its bounds to whatever pins it has, so browsing doesn't
// require granting location first.
export default function DiscoveryMap({
  center,
  pins,
  height = 280,
}: {
  center?: { lat: number; lng: number } | null;
  pins: Pin[];
  height?: number;
}) {
  const points: [number, number][] = pins.map((p) => [p.lat, p.lng]);
  const hasBoundsFit = !center && points.length > 0;
  const fallbackCenter: [number, number] = [39.8283, -98.5795]; // geographic center of the contiguous US — neutral default when there's nothing to fit yet

  return (
    <MapContainer
      {...(center
        ? { center: [center.lat, center.lng] as [number, number], zoom: 12 }
        : hasBoundsFit
        ? { bounds: L.latLngBounds(points), boundsOptions: { padding: [32, 32], maxZoom: 14 } }
        : { center: fallbackCenter, zoom: 4 })}
      style={{ height: `${height}px`, width: '100%', borderRadius: 'var(--radius-ticket)' }}
      scrollWheelZoom={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {center && (
        <Marker position={[center.lat, center.lng]} icon={markerIcon}>
          <Popup>You are here</Popup>
        </Marker>
      )}
      {pins.map((p) => (
        <Marker key={p._id} position={[p.lat, p.lng]} icon={markerIcon}>
          <Popup>
            <Link href={`/t/${p.slug}`}>{p.name}</Link>
            {p.barbers && p.barbers.length > 0 && (
              <ul>
                {p.barbers.map((b) => (
                  <li key={b._id}>
                    <Link href={`/t/${p.slug}/barbers/${b.slug}`}>{b.name}</Link>
                  </li>
                ))}
              </ul>
            )}
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
