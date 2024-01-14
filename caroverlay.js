function CarOverlay(url, size) {
  this._size = size;

  var img = document.createElement('img');
  img.src = url;
  img.style.position = 'absolute';
  img.style.width = size + 'px';
  img.style.height = size + 'px';
  img.style.transitionTimingFunction  = 'linear';

  this._elem = img;
}

CarOverlay.prototype = new google.maps.OverlayView();


CarOverlay.prototype.onAdd = function() {
  var panes = this.getPanes();
  panes.overlayImage.appendChild(this._elem);
};

CarOverlay.prototype.updatePosition = function(position, heading, timeout) {
  this._position = position;
  this._heading = heading;
  this._date = new Date().getTime() + timeout;
}

CarOverlay.prototype.draw = function() {
  if (this._position === null) return;

  var overlayProjection = this.getProjection();

  if (!overlayProjection) return;

  if (this._position !== undefined) {
    var now = new Date().getTime();
    if (this._date > now) {
      this._elem.style.transition = 'transform ' + (this._date - now) + 'ms linear';
    }

    var pos = overlayProjection.fromLatLngToDivPixel(this._position);
    var x = (pos.x - this._size / 2) + 'px';
    var y = (pos.y - this._size / 2) + 'px';
    var translate = 'translate(' + x + ', ' + y + ')';
    var rotate = 'rotate(' + this._heading + 'deg)';
    this._elem.style.transform = translate + ' ' + rotate;
  }
};
