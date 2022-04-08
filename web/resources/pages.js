/*
 * Because of the usage of websockets, we have to implement routing
 * using JS on the front end, instead of actual HTML pages. We do
 * this by having everypage be a <div> with a class of "page".
 * Everytime we would like to redirect to a diff page, we use the
 * switchPage function, which hides all the other pages, and shows
 * only the page we are routing to.
 */
const pages = document.querySelectorAll(".page");
function switchPage(pageId) {
  pages.forEach((page) => {
    page.style.display = "none";
    page.style.visibility = "hidden";
  });

  document.getElementById(pageId).style.display = "flex";
  document.getElementById(pageId).style.visibility = "visible";
  console.log(document.getElementById(pageId).style);
  window.dispatchEvent(new Event(`load-${pageId}`));
}
