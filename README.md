### YDX SAT to Mapbox gl js
Install:
`<script defer src="https://cdn.jsdelivr.net/gh/yan-map/ydxSat@86cc4d7/ydxSat.js"></script>`

Use:
```js
ydxSat.addYandexSatellite(map, {
  opacity: 1, //opacity of raster tiles 0-1 (0-100%)
  quality: 1, //size of tiles (0: 512px, 1: 245px, 2: 128px) - more is better
  prevLayer: "waterway-label", //Layer on top of raster
});

ydxSat.toggleYandexVisibility(map); //toggle visibility of raster layers

ydxSat.changeYandexOpacity(map, 0.5), //set quality of tiles 

ydxSat.changeYandexPosition(map, "waterway-label") //change top layer
