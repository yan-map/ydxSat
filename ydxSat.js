/// обязательно нужен proj4

proj4.defs(
  "EPSG:3395",
  "+proj=merc +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs"
);

const satVersion = "3.1726.0"; //Версия спутника, надо обновлять

const tileCache = new Map();
const MAX_CACHE_SIZE = 50 * 1024 * 1024; // 50 MB - максимальный кеш
let currentCacheSize = 0;
let currentTileIds = new Set();
let layerVisible = true;
let settings = { opacity: 1, quality: 0.5 };
let mapInstance = null;

function tileBoundsXYZ(x, y, z) {
  const tileSize = 40075016.685578 / Math.pow(2, z);
  const minX = -20037508.342789 + x * tileSize;
  const maxY = 20037508.342789 - y * tileSize;
  const maxX = minX + tileSize;
  const minY = maxY - tileSize;

  const corners = [
    [minX, minY],
    [minX, maxY],
    [maxX, maxY],
    [maxX, minY],
    [minX, minY],
  ];
  return corners.map(([x, y]) => proj4("EPSG:3395", "WGS84", [x, y]));
}

function getVisibleTiles(map) {
  const bounds = map.getBounds();
  const zoom = Math.min(
    Math.floor(map.getZoom()) + Math.round(2 * settings.quality),
    21
  );
  const tileSize = 40075016.685578 / Math.pow(2, zoom);
  const nw = proj4("WGS84", "EPSG:3395", [bounds.getWest(), bounds.getNorth()]);
  const se = proj4("WGS84", "EPSG:3395", [bounds.getEast(), bounds.getSouth()]);

  const minX = Math.floor((nw[0] + 20037508.342789) / tileSize);
  const maxX = Math.floor((se[0] + 20037508.342789) / tileSize);
  const minY = Math.floor((20037508.342789 - nw[1]) / tileSize);
  const maxY = Math.floor((20037508.342789 - se[1]) / tileSize);

  const tiles = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ x, y, z: zoom });
    }
  }
  return tiles;
}

function getTileUrl(x, y, z) {
  return `https://sat02.maps.yandex.net/tiles?l=sat&v=${satVersion}&x=${x}&y=${y}&z=${z}&lang=ru_KZ&client_id=yandex-web-maps`;
}

function getTileFromCache(x, y, z) {
  return tileCache.get(`${x}-${y}-${z}`);
}

function cacheTile(x, y, z, img) {
  const key = `${x}-${y}-${z}`;
  const imgSize = img.width * img.height * 4;

  if (currentCacheSize + imgSize > MAX_CACHE_SIZE) {
    tileCache.clear();
    currentCacheSize = 0;
  }

  tileCache.set(key, img);
  currentCacheSize += imgSize;
}

function addTileToMap(x, y, z, tileId, img) {
  if (mapInstance.getSource(tileId)) return;
  const corners = tileBoundsXYZ(x, y, z);

  mapInstance.addSource(tileId, {
    type: "image",
    url: img.src,
    coordinates: [corners[1], corners[2], corners[3], corners[0]],
  });

  mapInstance.addLayer(
    {
      id: tileId,
      type: "raster",
      source: tileId,
      paint: {
        "raster-opacity": settings.opacity,
      },
    },
    settings.prevLayer
  );
}

function updateTiles() {
  if (!layerVisible) return;

  const tiles = getVisibleTiles(mapInstance);
  const newTileIds = new Set();
  const tileLoadPromises = [];

  for (const { x, y, z } of tiles) {
    const tileId = `tile-${x}-${y}-${z}`;
    newTileIds.add(tileId);

    const cached = getTileFromCache(x, y, z);
    if (cached) {
      addTileToMap(x, y, z, tileId, cached);
      continue;
    }

    const promise = new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = getTileUrl(x, y, z);
      img.onload = () => {
        cacheTile(x, y, z, img);
        addTileToMap(x, y, z, tileId, img);
        resolve();
      };
      img.onerror = () => {
        console.warn(`Ошибка загрузки тайла ${x}/${y}/${z}`);
        resolve();
      };
    });

    tileLoadPromises.push(promise);
  }

  Promise.all(tileLoadPromises).then(() => {
    mapInstance.once("idle", () => {
      currentTileIds.forEach((tileId) => {
        if (!newTileIds.has(tileId)) {
          if (mapInstance.getLayer(tileId)) mapInstance.removeLayer(tileId);
          if (mapInstance.getSource(tileId)) mapInstance.removeSource(tileId);
        }
      });
      currentTileIds = newTileIds;
    });
  });
}

function addYandexSatellite(
  map,
  {
    opacity = 1, //Прозрачность 0-1
    quality = 0.5, //Качество 0-1
    prevLayer,
  } = {}
) {
  mapInstance = map;
  settings.opacity = opacity;
  settings.quality = quality;
  if (prevLayer) {
    settings.prevLayer = prevLayer;
  }
  layerVisible = true;

  map.on("load", updateTiles);
  map.on("moveend", updateTiles);
  map.on("zoomend", updateTiles);
  if (map.loaded()) updateTiles();
}

///Изменение видимости
function toggleYandexVisibility(map) {
  layerVisible = !layerVisible;

  if (layerVisible) {
    updateTiles();
  } else {
    currentTileIds.forEach((tileId) => {
      if (map.getLayer(tileId)) map.removeLayer(tileId);
      if (map.getSource(tileId)) map.removeSource(tileId);
    });
    currentTileIds.clear();
  }
}
///Изменение прозрачности
function changeYandexOpacity(map, opacity) {
  if (layerVisible) {
    currentTileIds.forEach((tileId) => {
      if (map.getLayer(tileId)) {
        settings.opacity = opacity;
        map.setPaintProperty(tileId, "raster-opacity", opacity);
      }
    });
  }
}

///Изменение позиции в стеке слоев
function changeYandexPosition(map, prevLayer) {
  if (layerVisible) {
    currentTileIds.forEach((tileId) => {
      if (map.getLayer(tileId)) {
        settings.prevLayer = prevLayer;
        map.moveLayer(tileId, settings.prevLayer);
      }
    });
  }
}

export {
  addYandexSatellite,
  toggleYandexVisibility,
  changeYandexOpacity,
  changeYandexPosition,
};
