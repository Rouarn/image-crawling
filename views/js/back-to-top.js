/** 返回顶部按钮交互 */
export function setupBackToTop() {
  const $btn = $("#back-to-top");
  if ($btn.length === 0) return;
  const onScroll = () => {
    const y = window.scrollY || document.documentElement.scrollTop || 0;
    $btn.toggleClass("is-visible", y > 200);
  };
  $(window).on("scroll", onScroll);
  onScroll();
  $btn.on("click", () => {
    try {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  });
}