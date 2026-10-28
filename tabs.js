// 두 페이지 공통: ◐ 버튼으로 밝은/어두운 화면을 바꾸고 이 기기에 기억합니다.
// 저장된 값은 각 페이지 <head>의 짧은 스크립트가 그리기 전에 먼저 적용합니다.
(() => {
  const root = document.documentElement;
  const button = document.querySelector(".tabs-theme");
  if (!button) return;
  button.addEventListener("click", () => {
    const dark = root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem("theme", root.dataset.theme);
    } catch {
      // 저장이 막혀 있어도 지금 화면에는 적용됩니다.
    }
    window.dispatchEvent(new Event("themechange"));
  });
})();
