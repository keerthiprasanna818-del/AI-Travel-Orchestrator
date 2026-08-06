import { useEffect, useState } from "react";
import { hotelFallbackImage, resolveHotelImage } from "@/lib/hotel-images";

type Props = {
  name: string;
  destination?: string | null;
  /** Optional pre-resolved local image path from the plan model. */
  imageUrl?: string | null | undefined;
  className?: string;
};

/**
 * Shared hotel card photo. Uses the centralized resolver (exact name → chain →
 * destination → category) and steps through the fallback chain if a file ever
 * fails to load, so a card is never blank.
 */
export function HotelImage({ name, destination, imageUrl, className }: Props) {
  const primary = imageUrl || resolveHotelImage(name, destination);
  const fallback = hotelFallbackImage(destination, name);
  const universal = "/hotels/fallback-city.jpg";

  const [src, setSrc] = useState(primary);

  useEffect(() => {
    setSrc(primary);
  }, [primary]);

  return (
    <img
      src={src}
      alt={`${name} hotel photo`}
      loading="lazy"
      decoding="async"
      width={1024}
      height={640}
      onError={() => {
        setSrc((current) => (current !== fallback ? fallback : universal));
      }}
      className={className ?? "h-36 w-full rounded-t-[inherit] object-cover"}
    />
  );
}
