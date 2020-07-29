const Raspistill = require('node-raspistill').Raspistill;
const camera = new Raspistill();
 
camera.takePhoto().then((photo) => {
    console.log(photo);
});