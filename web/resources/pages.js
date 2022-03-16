const pages = document.querySelectorAll(".page");
function switchPage(pageId) {
  pages.forEach((page) => {
    page.style.display = "none";
    page.style.visibility = "hidden";
  });

  document.getElementById(pageId).style.display = "block";
  document.getElementById(pageId).style.visibility = "visible";

  window.dispatchEvent(new Event(`load-${pageId}`));
}
