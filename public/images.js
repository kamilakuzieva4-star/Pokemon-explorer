document.querySelectorAll("img[data-fallback]").forEach((image) => {
  function recoverImage() {
    const fallback = image.dataset.fallback;
    if (fallback && fallback !== image.getAttribute("src")) {

     image.dataset.fallback = "";
      image.src = fallback;
      return;
    }
    image.hidden = true;
    const placeholder = image.parentElement.querySelector(".image-placeholder");
    if (placeholder) placeholder.hidden = false;
  }

  image.addEventListener("error", recoverImage);

  if (image.complete && image.naturalWidth === 0) recoverImage();
});
