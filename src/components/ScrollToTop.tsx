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
    window.scrollTo({ top: 0, left: 0 });
    document.querySelectorAll("main").forEach((el) => {
      el.scrollTo({ top: 0, left: 0 });
    });
  }, [pathname]);

  return null;
};

export default ScrollToTop;
