document.querySelectorAll("img[data-fallback]").forEach((image) => {
  function recoverImage() {
    const fallback = image.dataset.fallback;
    if (fallback && fallback !== image.getAttribute("src")) {
      // Try the smaller sprite once; never retry in a loop.
      image.dataset.fallback = "";
      image.src = fallback;
      return;
    }
    image.hidden = true;
    const placeholder = image.parentElement.querySelector(".image-placeholder");
    if (placeholder) placeholder.hidden = false;
  }

  image.addEventListener("error", recoverImage);

  // A cached image may have failed before this deferred script ran.
  if (image.complete && image.naturalWidth === 0) recoverImage();
});
