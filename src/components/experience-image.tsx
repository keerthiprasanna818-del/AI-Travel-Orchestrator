import { useEffect, useState } from "react";
import {
  UNIVERSAL_DEFAULT_IMAGE,
  resolveExperienceImageCandidates,
} from "@/lib/experience-images";

type Props = {
  name: string;
  category?: string | null;
  destination?: string | null;
  /** Optional pre-resolved local image path from the plan model. */
  imageUrl?: string | null | undefined;
  className?: string;
};

/**
 * Experience card photo. Walks the resolver's candidate chain
 * (exact → destination+category → category → universal default) via onError,
 * so a card never renders a blank area or coloured block.
 */
export function ExperienceImage({ name, category, destination, imageUrl, className }: Props) {
  const candidates = resolveExperienceImageCandidates({ name, category, destination, imageUrl });
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [candidates.join("|")]);

  const src = candidates[index] ?? UNIVERSAL_DEFAULT_IMAGE;

  return (
    <img
      src={src}
      alt={`${name}${category ? ` — ${category}` : ""} in ${destination ?? "your destination"}`}
      loading="lazy"
      width={1024}
      height={640}
      onError={() => {
        setIndex((i) => (i < candidates.length - 1 ? i + 1 : i));
      }}
      className={className ?? "h-28 w-full object-cover"}
    />
  );
}
