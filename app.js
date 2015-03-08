
window.playPathData = {
  paused: false,
  speedMultiplier: 1,
  changingPosition: false,
  autofollow: true,
  fps: 10
};

function slerp(a, b, t) {
  result = google.maps.geometry.spherical.interpolate(a, b, t);

  if (result.lat() - a.lat() < 1.0E-10 &&
      result.lng() - a.lng() < 1.0E-10) {
    // TODO: proper slerp interpolation when Google refuses
    result = new google.maps.LatLng(a.lat() + t * (b.lat() - a.lat()),
                                    a.lng() + t * (b.lng() - a.lng()));
  }

  return result;
}

var computeDistanceBetween = google.maps.geometry.spherical.computeDistanceBetween;

function mod(a, b) {
  return ((a % b) + b) & b;
}

function initialize(request) {
  var overviewMap = new google.maps.Map(document.getElementById('overviewMap'), {
    disableDefaultUI: true
  });

  var followMap = new google.maps.Map(document.getElementById('followMap'), {
    disableDefaultUI: true
  });

  var stopAutoFollow = function() {
    if (window.playPathData.justSetZoom) {
      window.playPathData.justSetZoom = false;
      return
    }

    window.playPathData.autofollow = false;
  }

  google.maps.event.addListener(followMap, 'dragstart', stopAutoFollow);
  google.maps.event.addListener(followMap, 'zoom_changed', stopAutoFollow);

  var overviewDirectionsDisplay = new google.maps.DirectionsRenderer();
  overviewDirectionsDisplay.setMap(overviewMap);
  var followDirectionsDisplay = new google.maps.DirectionsRenderer({
    preserveViewport: true
  });
  followDirectionsDisplay.setMap(followMap);

  var overviewCar = new CarOverlay('car.png', 64);
  overviewCar.setMap(overviewMap);

  var followCar = new CarOverlay('car.png', 64);
  followCar.setMap(followMap);

  var panorama = new google.maps.StreetViewPanorama(document.getElementById('panorama'), {
    disableDefaultUI: true
  });

  var directionsService = new google.maps.DirectionsService();

  var determineSegments = function(route) {
    var segments = [];
    var totalSteps = 0;

    for (var i = 0; i < route.legs.length; ++i) {
      var leg = route.legs[i];

      for (var j = 0; j < leg.steps.length; ++j) {
        var step = leg.steps[j];
        var speed = step.distance.value / step.duration.value;

        for (var k = 0; k < step.path.length - 1; ++k) {
          var segment = {}
          segment.step = totalSteps;
          segment.instructions = leg.steps[Math.min(j + 1, leg.steps.length - 1)].instructions;
          segment.from = step.path[k];
          segment.to = step.path[k + 1];
          segment.distance = computeDistanceBetween(segment.from, segment.to)
          segment.duration =  segment.distance / speed;
          segment.speed = speed;
          segment.heading = google.maps.geometry.spherical.computeHeading(segment.from, segment.to);
          segments.push(segment);
        }

        totalSteps += 1;
      }
    }

    var totalDuration = 0;
    var totalDistance = 0;

    for (var i = 0; i < segments.length; ++i) {
      totalDuration += segments[i].duration;
      totalDistance += segments[i].distance;
    }

    var eta = totalDuration;
    var distanceLeft = totalDistance;

    for (var i = 0; i < segments.length; ++i) {
      segments[i].eta = eta;
      segments[i].distanceLeft = distanceLeft;
      eta -= segments[i].duration;
      distanceLeft -= segments[i].distance;
      segments[i].totalSteps = totalSteps;
    }

    return segments;
  }

  var formatDistance = function (distance) {
    var unit = 'm';
    distance = Math.round(distance);

    if (distance >= 1000) {
      distance /= 1000;
      distance = distance.toFixed(2);
      unit = 'km';
    }

    return distance + '&nbsp' + unit;
  }

  var formatDuration = function(duration) {
    var days = Math.floor(duration / 60 / 60 / 24);
    duration -= days * 60 * 60 * 24;

    var hours = Math.floor(duration / 60 / 60);
    duration -= hours * 60 * 60;

    var minutes = Math.floor(duration / 60);
    duration -= minutes * 60;

    var seconds = Math.floor(duration);

    var values = [];

    if (days > 0)
      values.push(days + '&nbsp;day' + (days === 1 ? '' : 's'));
    if (hours > 0)
      values.push(hours + '&nbsp;hour' + (hours === 1 ? '' : 's'));
    if (minutes > 0)
      values.push(minutes + '&nbsp;minute' + (minutes === 1 ? '' : 's'));
    if (seconds > 0)
      values.push(seconds + '&nbsp;second' + (seconds === 1 ? '' : 's'));

    return values.length === 0 ? '-' : values.join(', ');
  }

  var updateCar = function(newPosition, newHeading) {
    var timeout = 1000 / window.playPathData.fps;
    overviewCar.updatePosition(newPosition, newHeading, timeout);
    followCar.updatePosition(newPosition, newHeading, timeout);

    overviewCar.draw();
    followCar.draw();
  }

  var updateDashboard = function(data, segment) {
    if (segment === undefined) return;

    var length = data.segments[0].distanceLeft;
    var distance = length - segment.distanceLeft + data.t;
    var eta = segment.eta - segment.duration * data.t / segment.distance;
    var elapsed = data.segments[0].eta - eta;

    document.getElementById('playPauseButton').value = window.playPathData.paused ? '▶' : '▮▮';
    document.getElementById('autofollow').checked = window.playPathData.autofollow;
    document.getElementById('distance').innerHTML = formatDistance(distance) + ' / ' + formatDistance(length);
    document.getElementById('speed').innerHTML = Math.round(segment.speed * 3.6) + '&nbsp;km/h or ' + Math.round(segment.speed * 2.23694) + '&nbsp;mph';

    if (data.speedMultiplier != 1)
      document.getElementById('speed').innerHTML += ' (x' + data.speedMultiplier + ')';

    document.getElementById('elapsed').innerHTML = formatDuration(elapsed);
    document.getElementById('eta').innerHTML = formatDuration(eta);
    document.getElementById('step').innerHTML = (segment.step + 1) + '/' + segment.totalSteps;
    document.getElementById('instructions').innerHTML = segment.instructions;
  }

  var playPath = function() {
    var data = window.playPathData;
    var segment = null;

    while (true) {
      segment = data.segments[data.segment];

      if (data.t < 0) {
        if (data.segment > 0) {
          data.segment -= 1;
          data.t = data.segments[data.segment].distance + data.t;
        } else {
          data.t = 0;
        }
      } else if (data.t >= segment.distance) {
        if (data.segment < data.segments.length - 1) {
          data.segment += 1;
          data.t -= segment.distance;
        } else {
          data.t = segment.distance;
          break;
        }
      } else {
        break;
      }
    }

    updateDashboard(data, segment);

    if (!data.paused && segment !== undefined) {
      var heading = segment.heading;

      if (data.heading === undefined) {
        data.heading = heading;
      } else {
        data.heading = data.heading + 2 * (heading - data.heading) / data.fps;
      }

      var interpolated = slerp(segment.from, segment.to, data.t / segment.distance);
      panorama.setPosition(interpolated);
      panorama.setPov({ heading: heading, pitch: 0 });

      updateCar(interpolated, data.heading);

      if (data.autofollow) {
        window.playPathData.justSetZoom = true;
        followMap.setZoom(Math.round(-2 * segment.speed / 27 + 164 / 9));
        followMap.panTo(interpolated);
      }

      data.t += data.speedMultiplier * (segment.speed / data.fps);
    }

    setTimeout(function() {
      playPath(data);
    }, 1000 / data.fps);
  }

  directionsService.route(request, function(response, status) {
    if (status == google.maps.DirectionsStatus.OK) {
      var data = window.playPathData;
      data.segments = determineSegments(response.routes[0]);
      data.segment = 0;
      data.t = 0;

      overviewDirectionsDisplay.setDirections(response);
      followDirectionsDisplay.setDirections(response);

      playPath();

      document.getElementById('searchControls').style.display = 'none';
    }
  });
}

function speedUp() {
  var data = window.playPathData;
  if (data.speedMultiplier >= 1)
    data.speedMultiplier *= 2;
  else if (data.speedMultiplier < -1)
    data.speedMultiplier /= 2;
  else
    data.speedMultiplier = 1;
}

function slowDown() {
  var data = window.playPathData;
  if (data.speedMultiplier > 1)
    data.speedMultiplier /= 2;
  else if (data.speedMultiplier <= -1)
    data.speedMultiplier *= 2;
  else
    data.speedMultiplier = -1;
}

function goOnARoadtrip() {
  var request = {
      origin: document.getElementById('origin').value,
      destination: document.getElementById('destination').value,
      travelMode: google.maps.TravelMode.DRIVING,
      avoidHighways: false,
      avoidTolls: true
  };

  initialize(request);
  return false;
}

//google.maps.event.addDomListener(window, 'load', initialize);