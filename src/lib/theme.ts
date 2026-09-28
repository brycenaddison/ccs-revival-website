/** Toggle the applied theme, remember it for the next visit, and update embedded charts. */
export function toggleTheme(): void {
  const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", next);
  try {
    localStorage.setItem("theme", next);
  } catch {
    // The current visit can still change theme when browser storage is unavailable.
  }
  document.querySelectorAll("iframe").forEach(frame => {
    try { frame.contentWindow?.postMessage({ type: "theme-change", theme: next }, "*"); } catch {}
  });
}
