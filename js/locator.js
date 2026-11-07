"use strict";

(function () {
  const mapEl = document.getElementById("map");
  const btn = document.getElementById("locate-btn");
  const box = document.getElementById("locator-result");
  const titleEl = document.getElementById("result-title");
  const textEl = document.getElementById("result-text");
  const areaList = document.getElementById("area-list");
  if (!mapEl || !btn || !box) return;

  if (typeof L === "undefined") {
    mapEl.textContent = "The map could not load. Check your connection and refresh the page.";
    btn.disabled = true;
    return;
  }

  /* ---------- Result box ---------- */
  function setResult(state, title, text, withContact) {
    box.dataset.state = state;
    titleEl.textContent = title;
    textEl.textContent = text;
    const hasPhone =
      typeof SERVICE_CONTACT !== "undefined" &&
      SERVICE_CONTACT.tel &&
      !/x/i.test(SERVICE_CONTACT.tel);
    if (withContact && hasPhone) {
      textEl.append(" ");
      const link = document.createElement("a");
      link.href = `tel:${SERVICE_CONTACT.tel}`;
      link.textContent = `Call ${SERVICE_CONTACT.display}`;
      textEl.append(link);
    }
  }

  /* ---------- Map ---------- */
  const map = L.map(mapEl, {
    scrollWheelZoom: false, // so the page can still scroll past the map
    dragging: !L.Browser.mobile, // one-finger scroll keeps working on phones
    minZoom: 9
  }).setView(SERVICE_MAP.center, SERVICE_MAP.zoom);

  const tiles = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
  }).addTo(map);

  let tileErrors = 0;
  tiles.on("tileerror", () => {
    tileErrors += 1;
    if (tileErrors === 5) {
      setResult(
        "error",
        "The map tiles did not load.",
        "Check your internet connection or try a different browser. Your service areas are still marked.",
        false
      );
    }
  });

  const named = [];
  const areaLayer = L.geoJSON(SERVICE_AREAS, {
    style: {
      color: "#8fd4ee",
      weight: 1.5,
      fillColor: "#8fd4ee",
      fillOpacity: 0.22
    },
    onEachFeature: (feature, layer) => {
      const name = feature.properties && feature.properties.name;
      if (name) {
        layer.bindTooltip(name, { sticky: true });
        named.push({ name, layer });
      }
    }
  }).addTo(map);

  const bounds = areaLayer.getBounds();
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });

  // enable scroll-zoom only after the visitor clicks the map
  map.on("click", () => map.scrollWheelZoom.enable());
  mapEl.addEventListener("mouseleave", () => map.scrollWheelZoom.disable());

  const pinLayer = L.layerGroup().addTo(map);

  /* ---------- Area chips ---------- */
  if (areaList) {
    named.forEach(({ name, layer }) => {
      const li = document.createElement("li");
      const chip = document.createElement("button");
      chip.type = "button";
      chip.textContent = name;
      chip.addEventListener("click", () => {
        map.fitBounds(layer.getBounds(), { padding: [40, 40] });
      });
      li.append(chip);
      areaList.append(li);
    });
  }

  /* ---------- Point-in-polygon (ray casting) ---------- */
  function ringContains(ring, lng, lat) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      const crosses =
        yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
      if (crosses) inside = !inside;
    }
    return inside;
  }

  function polygonContains(rings, lng, lat) {
    if (!ringContains(rings[0], lng, lat)) return false;
    for (let k = 1; k < rings.length; k += 1) {
      if (ringContains(rings[k], lng, lat)) return false; // inside a hole
    }
    return true;
  }

  function findArea(lat, lng) {
    for (const feature of SERVICE_AREAS.features) {
      const g = feature.geometry;
      if (!g) continue;
      const polygons =
        g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
      for (const poly of polygons) {
        if (polygonContains(poly, lng, lat)) return feature;
      }
    }
    return null;
  }

  /* ---------- Check a point ---------- */
  function check(lat, lng, source, accuracy) {
    const feature = findArea(lat, lng);
    const inside = Boolean(feature);
    const color = inside ? "#8fd4ee" : "#f2a487";
    const subject = source === "you" ? "Your current location" : "The spot you tapped";
    const name = feature && feature.properties && feature.properties.name;

    pinLayer.clearLayers();
    if (accuracy && accuracy > 30) {
      L.circle([lat, lng], {
        radius: accuracy,
        color,
        weight: 1,
        fillOpacity: 0.08,
        interactive: false
      }).addTo(pinLayer);
    }
    L.circleMarker([lat, lng], {
      radius: 8,
      weight: 2,
      color: "#0b1316",
      fillColor: color,
      fillOpacity: 1,
      interactive: false
    }).addTo(pinLayer);

    const accuracyNote =
      accuracy && accuracy > 500
        ? ` Your device reported about ±${Math.round(accuracy)} m accuracy, so if you are near the edge of an area, please confirm with us.`
        : "";

    const center = bounds.isValid() ? bounds.getCenter() : null;
    const far = center ? map.distance([lat, lng], center) > 50000 : false;

    if (inside) {
      setResult(
        "inside",
        "Yes, we serve this area.",
        name
          ? `${subject} is inside ${name}, one of our service areas.${accuracyNote}`
          : `${subject} is inside our service area.${accuracyNote}`,
        true
      );
    } else if (far) {
      setResult(
        "outside",
        "Not in our service area.",
        `${subject} is outside Kathmandu Valley, where we currently deliver.`,
        false
      );
    } else {
      setResult(
        "outside",
        "Not in our service area yet.",
        `${subject} is outside the areas we serve right now.${accuracyNote} We are always looking to grow, so get in touch to ask about your area.`,
        true
      );
    }

    if (source === "you") {
      if (inside) {
        map.flyTo([lat, lng], Math.max(map.getZoom(), 14), { duration: 1 });
      } else if (!far) {
        map.fitBounds(areaLayer.getBounds().extend([lat, lng]), { padding: [40, 40] });
      }
    }
  }

  map.on("click", (event) => {
    check(event.latlng.lat, event.latlng.lng, "pin", null);
  });

  /* ---------- Current location ---------- */
  function onPosition(position) {
    btn.disabled = false;
    btn.textContent = "Use my current location";
    check(position.coords.latitude, position.coords.longitude, "you", position.coords.accuracy);
  }

  function onError(error) {
    btn.disabled = false;
    btn.textContent = "Use my current location";
    const messages = {
      1: "Location permission was blocked. Allow it in your browser's site settings, or tap the map to check a spot instead.",
      2: "We could not work out where you are. Try again, or tap the map to check a spot.",
      3: "Finding your location took too long. Try again, or tap the map to check a spot."
    };
    setResult(
      "error",
      "Could not get your location.",
      messages[error.code] || messages[2],
      false
    );
  }

  btn.addEventListener("click", () => {
    if (!window.isSecureContext || !("geolocation" in navigator)) {
      setResult(
        "error",
        "Location is not available here.",
        "Browsers only share location on secure (https) pages. Tap the map to check a spot instead.",
        false
      );
      return;
    }
    btn.disabled = true;
    btn.textContent = "Finding you…";
    setResult("loading", "Finding you…", "Allow location access when your browser asks.", false);
    navigator.geolocation.getCurrentPosition(onPosition, onError, {
      enableHighAccuracy: true,
      timeout: 12000,
      maximumAge: 60000
    });
  });
})();