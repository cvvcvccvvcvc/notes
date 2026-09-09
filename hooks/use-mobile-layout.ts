import { useEffect, useState } from 'react';

export const MOBILE_LAYOUT_QUERY = '(max-width: 760px)';

export function mobileLayoutMatches() {
  return window.matchMedia(MOBILE_LAYOUT_QUERY).matches;
}

export function useMobileLayout() {
  const [matches, setMatches] = useState(mobileLayoutMatches);

  useEffect(() => {
    const media = window.matchMedia(MOBILE_LAYOUT_QUERY);
    const update = () => setMatches(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return matches;
}
