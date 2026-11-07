/**
 * Service areas for the coverage map.
 *
 * The three shapes below are SAMPLES so you can see the feature working.
 * Replace the whole SERVICE_AREAS object with your real areas (see the
 * steps after this code).
 *
 * Coordinates are [longitude, latitude].
 */
const SERVICE_MAP = {
  center: [27.7, 85.35], // [lat, lng] used if no areas are defined
  zoom: 11
};

/** Shown in the result box. Leave the X's until you add a real number. */
const SERVICE_CONTACT = {
  display: "+977 XXXXXXXXXX",
  tel: "+977XXXXXXXXXX"
};

const SERVICE_AREAS = {
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": {
        "name": "distribution"
      },
      "geometry": {
        "type": "Polygon",
        "coordinates": [
          [
            [
              85.285234,
              27.697284
            ],
            [
              85.292918,
              27.704352
            ],
            [
              85.340091,
              27.701084
            ],
            [
              85.351946,
              27.673039
            ],
            [
              85.303184,
              27.676535
            ],
            [
              85.28962,
              27.66194
            ],
            [
              85.272965,
              27.677904
            ],
            [
              85.28859,
              27.690064
            ],
            [
              85.285234,
              27.697284
            ]
          ]
        ]
      }
    }
  ]
};