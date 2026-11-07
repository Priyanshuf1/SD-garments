fetch('https://alleyrich.com/assets/js/review-fisheye.js')
  .then(res => res.text())
  .then(code => {
    console.log('Fisheye file length:', code.length);
    console.log('Contains canAutoScroll:', code.includes('canAutoScroll'));
    console.log('Contains autoScrollSpeed 0.32:', code.includes('0.32'));
    console.log('Contains mouseenter hover listener:', code.includes('this.isHovered = true'));
    console.log('Contains window scroll wake listener:', code.includes('window.addEventListener("scroll"'));
  })
  .catch(err => console.error(err));
