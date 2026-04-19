import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets scroll to top on route change.
 * The app uses an internal scroll container (<main> inside AppLayout),
 * so we reset both the window and any scrollable <main> element.
 */
const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const reset = () => {
      window.scrollTo(0, 0);
      document.querySelectorAll("main, [data-scroll-container]").forEach((el) => {
        (el as HTMLElement).scrollTop = 0;
        (el as HTMLElement).scrollLeft = 0;
      });
    };
    // Run immediately and after the next paint to catch late-mounted scroll containers
    reset();
    const raf = requestAnimationFrame(reset);
    const t = setTimeout(reset, 50);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [pathname]);

  return null;
};

export default ScrollToTop;
