'use client';

import React, { useState, useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import { booleanPointInPolygon, polygon } from '@turf/turf';
import {
  Phone,
  Globe,
  X,
  PlusCircle,
  LocateFixed,
  PencilLine,
  Star,
  AlertCircle,
  List,
  Map as MapIcon
} from 'lucide-react';

// --- STYLING CONSTANTS (Hand-Drawn & Relaxed) ---
const COLORS = {
  primary: '#FF4500', // Safety Orange
  bg: '#EAEAEA', // Distressed Technical Gray
  card: '#FFFFFF',
  text: '#1A1A1A', // Ink Black
  line: '#333333' // Sketchy Line
};

// Custom component for "rough" borders
const SketchyBox = ({ children, className = '', style = {}, onClick }) => (
  <div
    onClick={onClick}
    className={`relative transition-transform active:scale-[0.98] md:hover:scale-[1.01] ${className}`}
    style={{
      backgroundColor: COLORS.card,
      border: `2px solid ${COLORS.text}`,
      borderRadius: '255px 15px 225px 15px/15px 225px 15px 255px',
      boxShadow: '4px 4px 0px 0px rgba(0,0,0,0.1)',
      ...style
    }}
  >
    {children}
  </div>
);

const App = () => {
  const [restaurants, setRestaurants] = useState([]);
  const [selectedRest, setSelectedRest] = useState(null);
  const [view, setView] = useState('home');
  const [isRecommendOpen, setIsRecommendOpen] = useState(false);
  const [isLearnMoreOpen, setIsLearnMoreOpen] = useState(false);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState(null);
  const [recommendType, setRecommendType] = useState('recommend');
  const [recommendForm, setRecommendForm] = useState({
    name: '',
    address: '',
    description: ''
  });
  const [isSubmittingRecommend, setIsSubmittingRecommend] = useState(false);

  const [mobileTab, setMobileTab] = useState('map');
  const DEFAULT_ZIP = '10017';
  const DEFAULT_CENTER = [-73.975, 40.752];
  const DEFAULT_ZOOM = 13;

  const [zipCode, setZipCode] = useState('');
  const [isSearchingZip, setIsSearchingZip] = useState(false);
  const [isDrawingRadius, setIsDrawingRadius] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [drawGeo, setDrawGeo] = useState([]);

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const userMarkerRef = useRef(null);
  const canvasRef = useRef(null);
  const drawPathRef = useRef([]);
  const drawGeoRef = useRef([]);
  const resizeObserverRef = useRef(null);

  const parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];
      if (char === '"' && inQuotes && next === '"') {
        field += '"';
        i += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        row.push(field);
        field = '';
        continue;
      }
      if ((char === '\n' || char === '\r') && !inQuotes) {
        if (field.length || row.length) {
          row.push(field);
          rows.push(row);
          row = [];
          field = '';
        }
        continue;
      }
      field += char;
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  };

  const toNumber = (value) => {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  };

  useEffect(() => {
    const loadCsv = async () => {
      try {
        const res = await fetch('/data/restaurant_nb.csv', { cache: 'no-store' });
        const text = await res.text();
        const rows = parseCsv(text).filter((r) => r.length && r.some((cell) => cell.trim() !== ''));
        if (!rows.length) return;
        const headers = rows[0].map((h) => h.trim().toLowerCase());
        const dataRows = rows.slice(1);

        const get = (row, key) => {
          const idx = headers.indexOf(key);
          return idx >= 0 ? row[idx]?.trim() : '';
        };

        const parseLocation = (value) => {
          if (!value) return { lat: null, lng: null };
          const parts = value.split(',').map((p) => p.trim()).filter(Boolean);
          if (parts.length < 2) return { lat: null, lng: null };
          const lat = toNumber(parts[0]);
          const lng = toNumber(parts[1]);
          return { lat, lng };
        };

        const mapped = dataRows
          .filter((row) => row.some((cell) => (cell || '').trim() !== ''))
          .map((row, idx) => {
            const name = get(row, 'restaurant name');
            const cuisine = get(row, 'category');
            const website = get(row, 'website');
            const phone = get(row, 'phone');
            const address = get(row, 'address');
            const city = get(row, 'city');
            const state = get(row, 'state');
            const zip = get(row, 'zip code');
            const location = get(row, 'location');
            const { lat, lng } = parseLocation(location);

            return {
              id: `${name || 'row'}-${idx}`,
              name: name || 'Unknown',
              address: [address, city, state, zip].filter(Boolean).join(', '),
              cuisine: cuisine || 'Local',
              phone: phone || '',
              website: website || '#',
              description: '',
              lat,
              lng,
              rating: null,
              reviewCount: null
            };
          });

        setRestaurants(mapped);
      } catch (err) {
        // keep empty if loading fails
        setRestaurants([]);
      }
    };

    loadCsv();
  }, []);

  useEffect(() => {
    if (view !== 'map') return;
    if (mapRef.current || !mapContainerRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors'
          }
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm'
          }
        ]
      },
      center: DEFAULT_CENTER,
      zoom: DEFAULT_ZOOM
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    map.on('click', () => setSelectedRest(null));

    mapRef.current = map;

    const updateCanvasSize = () => {
      if (!canvasRef.current || !mapContainerRef.current) return;
      const { clientWidth, clientHeight } = mapContainerRef.current;
      canvasRef.current.width = clientWidth;
      canvasRef.current.height = clientHeight;
      redrawFromGeo();
    };

    resizeObserverRef.current = new ResizeObserver(updateCanvasSize);
    resizeObserverRef.current.observe(mapContainerRef.current);
    updateCanvasSize();

    map.on('move', () => {
      if (drawGeoRef.current.length > 2) redrawFromGeo();
    });

    return () => {
      if (resizeObserverRef.current) resizeObserverRef.current.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [view]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (isDrawingRadius) {
      map.dragPan.disable();
      map.scrollZoom.disable();
      map.doubleClickZoom.disable();
      map.touchZoomRotate.disable();
    } else {
      map.dragPan.enable();
      map.scrollZoom.enable();
      map.doubleClickZoom.enable();
      map.touchZoomRotate.enable();
    }
  }, [isDrawingRadius]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (view === 'map' && (mobileTab === 'map' || window.innerWidth >= 768)) {
      map.resize();
    }
  }, [view, mobileTab]);

  const redrawCanvas = (points) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (!points || points.length < 2) return;

    ctx.strokeStyle = 'rgba(255, 69, 0, 0.8)';
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 6]);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();

    if (points.length > 2) {
      ctx.globalAlpha = 0.08;
      ctx.fillStyle = COLORS.primary;
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  };

  const redrawFromGeo = () => {
    const map = mapRef.current;
    if (!map || drawGeoRef.current.length < 2) return;

    const projected = drawGeoRef.current.map((coord) => {
      const p = map.project(coord);
      return { x: p.x, y: p.y };
    });

    drawPathRef.current = projected;
    redrawCanvas(projected);
  };

  const startDrawing = (e) => {
    if (!isDrawingRadius || !canvasRef.current || !mapRef.current) return;
    e.preventDefault();

    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    drawPathRef.current = [{ x, y }];
    drawGeoRef.current = [[...mapRef.current.unproject([x, y]).toArray()]];
    setIsDragging(true);
    redrawCanvas(drawPathRef.current);
  };

  const updateDrawing = (e) => {
    if (!isDragging || !canvasRef.current || !mapRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const last = drawPathRef.current[drawPathRef.current.length - 1];
    if (last && Math.hypot(last.x - x, last.y - y) < 2) return;

    drawPathRef.current = [...drawPathRef.current, { x, y }];
    drawGeoRef.current = [...drawGeoRef.current, [...mapRef.current.unproject([x, y]).toArray()]];
    redrawCanvas(drawPathRef.current);
  };

  const endDrawing = () => {
    if (!isDragging) return;
    setIsDragging(false);
    setIsDrawingRadius(false);

    if (drawGeoRef.current.length < 3) {
      drawGeoRef.current = [];
      drawPathRef.current = [];
      redrawCanvas([]);
      setDrawGeo([]);
      return;
    }

    setDrawGeo([...drawGeoRef.current]);
    const map = mapRef.current;
    if (map) {
      let minLng = drawGeoRef.current[0][0];
      let minLat = drawGeoRef.current[0][1];
      let maxLng = drawGeoRef.current[0][0];
      let maxLat = drawGeoRef.current[0][1];
      for (let i = 1; i < drawGeoRef.current.length; i += 1) {
        const [lng, lat] = drawGeoRef.current[i];
        minLng = Math.min(minLng, lng);
        minLat = Math.min(minLat, lat);
        maxLng = Math.max(maxLng, lng);
        maxLat = Math.max(maxLat, lat);
      }
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat]
        ],
        { padding: 60, maxZoom: 15, duration: 700 }
      );
    }
  };

  const focusOnRestaurant = (rest) => {
    setSelectedRest(rest);
    const map = mapRef.current;
    if (map && Number.isFinite(rest?.lng) && Number.isFinite(rest?.lat)) {
      map.flyTo({ center: [rest.lng, rest.lat], zoom: 14.5, speed: 1.2 });
    }
  };

  const clearDrawing = () => {
    drawGeoRef.current = [];
    drawPathRef.current = [];
    redrawCanvas([]);
    setDrawGeo([]);
    flyToDefault();
  };

  const handleGeolocate = () => {
    if (!navigator.geolocation || !mapRef.current) return;

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapRef.current;

        map.flyTo({ center: [longitude, latitude], zoom: 14, speed: 1.4 });

        if (!userMarkerRef.current) {
          const el = document.createElement('div');
          el.className = 'nb-user-marker';
          userMarkerRef.current = new maplibregl.Marker({ element: el }).setLngLat([longitude, latitude]).addTo(map);
        } else {
          userMarkerRef.current.setLngLat([longitude, latitude]);
        }
      },
      () => {
        // silent fail
      },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const flyToDefault = () => {
    const map = mapRef.current;
    if (!map) return;
    map.flyTo({ center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM, speed: 1.2 });
  };

  const handleZipSearch = async () => {
    const map = mapRef.current;
    const zip = zipCode.trim();
    if (!map) return;
    if (!zip) {
      flyToDefault();
      return;
    }
    setIsSearchingZip(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&postalcode=${encodeURIComponent(
        zip
      )}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (Array.isArray(data) && data.length) {
        const lat = Number(data[0].lat);
        const lng = Number(data[0].lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          map.flyTo({ center: [lng, lat], zoom: 13, speed: 1.2 });
        }
      }
    } catch (err) {
      // silent fail
    } finally {
      setIsSearchingZip(false);
    }
  };

  const resetRecommendForm = () => {
    setRecommendForm({ name: '', address: '', description: '' });
  };

  const getWordCount = (value) => {
    return value
      .trim()
      .split(/\s+/)
      .filter(Boolean).length;
  };

  const handleSubmitRecommend = async () => {
    if (isSubmittingRecommend) return;
    const isRecommendValid = recommendForm.name.trim() && recommendForm.address.trim();
    const isMistakeValid = recommendForm.name.trim() && recommendForm.address.trim() && recommendForm.description.trim();
    const descriptionWords = getWordCount(recommendForm.description);
    if (descriptionWords > 200) return;
    if (recommendType === 'recommend' && !isRecommendValid) return;
    if (recommendType === 'mistake' && !isMistakeValid) return;

    setIsSubmittingRecommend(true);
    try {
      await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: recommendType,
          name: recommendForm.name.trim(),
          address: recommendForm.address.trim(),
          description: recommendForm.description.trim()
        })
      });
      resetRecommendForm();
      setIsRecommendOpen(false);
    } catch (err) {
      // silent fail
    } finally {
      setIsSubmittingRecommend(false);
    }
  };

  const filteredRestaurants = restaurants.filter((rest) => {
    if (!Number.isFinite(rest.lat) || !Number.isFinite(rest.lng)) return false;
    if (!drawGeo || drawGeo.length < 3) return true;
    const poly = polygon([[...drawGeo, drawGeo[0]]]);
    return booleanPointInPolygon([rest.lng, rest.lat], poly);
  });

  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = [];

    filteredRestaurants.forEach((rest) => {
      const el = document.createElement('button');
      el.className = `nb-marker${selectedRest?.id === rest.id ? ' is-selected' : ''}`;
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        setSelectedRest(rest);
      });

      const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
        .setLngLat([rest.lng, rest.lat])
        .addTo(mapRef.current);

      markersRef.current.push(marker);
    });
  }, [filteredRestaurants, selectedRest]);

  useEffect(() => {
    if (selectedRest && drawGeo.length > 2) {
      const stillVisible = filteredRestaurants.some((rest) => rest.id === selectedRest.id);
      if (!stillVisible) setSelectedRest(null);
    }
  }, [filteredRestaurants, selectedRest, drawGeo.length]);

  return (
    <div
      className="h-[100dvh] w-screen font-serif flex flex-col tracking-tight overflow-hidden"
      style={{ backgroundColor: COLORS.bg, color: COLORS.text }}
    >
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.03] z-[100]"
        style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/stardust.png')" }}
      ></div>

      {/* --- NAVIGATION (Locked Height) --- */}
      <nav className="flex-none px-4 md:px-6 py-3 md:py-4 flex justify-between items-center z-50 bg-white/60 backdrop-blur-md border-b border-black/10">
        <div className="flex items-center gap-3 cursor-pointer group" onClick={() => setView('home')}>
          <img
            src="/assets/neighborhood-boy-asset.png"
            alt="Neighborhood Boy"
            className="w-[54px] h-[54px] md:w-[58px] md:h-[58px] object-contain"
          />
          <div className="flex flex-col">
            <h1 className="text-xl md:text-2xl font-black font-sans italic tracking-tighter group-hover:text-[#FF4500] transition-colors leading-none">
              Neighborhood
            </h1>
            <div className="flex items-center gap-2">
              <h1 className="text-lg md:text-xl font-medium leading-none font-serif">Boy</h1>
              <div className="h-[1px] flex-grow bg-black mt-1 opacity-20"></div>
            </div>
          </div>
        </div>
        <div className="flex gap-4 items-center">
          <button
            onClick={() => setIsRecommendOpen(true)}
            className="flex items-center gap-2 px-3 md:px-5 py-2 text-[10px] md:text-xs font-bold font-sans border-2 border-black rounded-full bg-[#FF4500] text-white transition-colors shadow-sm"
          >
            <PlusCircle size={14} />
            <span className="uppercase tracking-widest">Recommend</span>
          </button>
          <button
            onClick={() => setIsAboutOpen(true)}
            className="flex items-center gap-2 px-3 md:px-5 py-2 text-[10px] md:text-xs font-bold font-sans border-2 border-black rounded-full bg-white text-black transition-colors shadow-sm hover:bg-black hover:text-white"
          >
            <span className="uppercase tracking-widest">About</span>
          </button>
        </div>
      </nav>

      {/* --- MAIN CONTENT --- */}
      <main className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        {view === 'home' && (
          <section className="h-full w-full flex flex-col items-center justify-between py-4 md:py-8 px-6 z-10">
            {/* Top Buffer to push content to middle */}
            <div className="hidden md:block flex-[0.4]"></div>

            <div className="w-full max-w-4xl flex flex-col items-center gap-y-6 md:gap-y-8">
              <div className="space-y-4 md:space-y-6 text-center">
                <h2 className="text-3xl sm:text-5xl md:text-6xl lg:text-7xl font-black leading-[0.95] tracking-tighter">
                  The{' '}
                  <span className="text-[#FF4500] relative italic font-serif">
                    Neighborhood
                    <svg
                      className="absolute -bottom-1 md:-bottom-2 left-0 w-full"
                      height="8"
                      viewBox="0 0 100 10"
                      preserveAspectRatio="none"
                    >
                      <path
                        d="M0 5 Q 25 0, 50 5 T 100 5"
                        fill="none"
                        stroke="#FF4500"
                        strokeWidth="3"
                      />
                    </svg>
                  </span>{' '}
                  <br />
                  City Restaurant Map.
                </h2>
                <p className="text-xs sm:text-sm md:text-lg font-medium max-w-lg mx-auto leading-relaxed text-stone-600">
                  A hand-inked guide to the restaurants that deliver directly in your neighborhood.
                  <span className="block font-bold mt-2">
                    Save on delivery fees and Support your local small business at the same time!
                  </span>
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center w-full sm:w-auto px-4">
                <button
                  onClick={() => setView('map')}
                  className="px-8 py-3 md:py-4 bg-black text-white font-bold font-sans text-base md:text-lg rotate-[-1deg] active:rotate-0 transition-transform shadow-[6px_6px_0px_#FF4500]"
                  style={{ borderRadius: '8px 24px 8px 24px' }}
                >
                  Delivery Nearby 👅
                </button>
                <button
                  onClick={() => setIsLearnMoreOpen(true)}
                  className="px-8 py-3 md:py-4 border-2 border-black font-bold font-sans text-base md:text-lg bg-white rotate-[1deg] active:rotate-0 transition-transform shadow-[6px_6px_0px_rgba(0,0,0,0.05)]"
                  style={{ borderRadius: '24px 8px 24px 8px' }}
                >
                  Learn More
                </button>
              </div>
            </div>

              <p className="text-[8px] font-sans font-bold mt-2 uppercase tracking-[0.3em] opacity-30">
                Neighborhood Boy v1.12
              </p>

            {/* Bottom Buffer */}
            <div className="hidden md:block flex-[0.4]"></div>
          </section>
        )}

        {view === 'map' && (
          <div className="flex-grow flex flex-col md:flex-row h-full overflow-hidden p-2 md:p-4 gap-4 md:gap-6">
            <div className="md:hidden flex-none flex gap-2 mb-2 p-1 bg-stone-200 rounded-xl">
              <button
                onClick={() => setMobileTab('map')}
                className={`flex-grow flex items-center justify-center gap-2 py-3 rounded-lg font-sans font-bold text-[10px] uppercase tracking-widest transition-all ${
                  mobileTab === 'map' ? 'bg-white shadow-sm' : 'opacity-40'
                }`}
              >
                <MapIcon size={14} /> Map
              </button>
              <button
                onClick={() => setMobileTab('list')}
                className={`flex-grow flex items-center justify-center gap-2 py-3 rounded-lg font-sans font-bold text-[10px] uppercase tracking-widest transition-all ${
                  mobileTab === 'list' ? 'bg-white shadow-sm' : 'opacity-40'
                }`}
              >
                <List size={14} /> List ({filteredRestaurants.length})
              </button>
            </div>

            <aside
              className={`${mobileTab === 'list' ? 'flex' : 'hidden'} md:flex w-full md:w-80 flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar`}
            >
              <div className="sticky top-0 z-10 p-3 bg-stone-800 text-white font-sans font-bold text-[10px] tracking-[0.2em] uppercase text-center flex justify-between px-4 rounded-lg md:rounded-none">
                <span>Nearby Restaurants</span>
                <span>{filteredRestaurants.length}</span>
              </div>
              <div className="flex flex-col gap-4 pb-20 md:pb-4">
                {filteredRestaurants.length === 0 ? (
                  <div className="p-10 text-center opacity-40 italic">No spots found in your zone. Scribble a new one.</div>
                ) : (
                  filteredRestaurants.map((rest) => (
                    <SketchyBox
                      key={rest.id}
                      onClick={() => focusOnRestaurant(rest)}
                      className={`p-5 cursor-pointer bg-white transition-all ${
                        selectedRest?.id === rest.id ? 'ring-4 ring-[#FF4500]' : 'opacity-90 active:opacity-100'
                      }`}
                    >
                      <h4 className="font-bold text-xl mb-1 italic">{rest.name}</h4>
                      {rest.rating != null && rest.reviewCount != null && (
                        <div className="flex items-center gap-2 mb-2">
                          <Star size={12} fill="#FFD700" strokeWidth={0} />
                          <span className="text-xs font-sans font-black ml-1 text-stone-800">{rest.rating}</span>
                          <span className="text-[9px] font-sans font-bold opacity-30 uppercase">
                            ({rest.reviewCount})
                          </span>
                        </div>
                      )}
                      <div className="text-[10px] font-sans font-bold opacity-50 mb-3 uppercase tracking-wider">
                        {rest.cuisine} — {rest.address}
                      </div>
                    </SketchyBox>
                  ))
                )}
              </div>
            </aside>

            <div className={`${mobileTab === 'map' ? 'flex' : 'hidden'} md:flex flex-grow flex-shrink basis-0 relative flex-col h-full`}>
              <div className="absolute top-2 md:top-4 left-1/2 -translate-x-1/2 z-[40] w-full max-w-2xl px-2 md:px-4">
                <SketchyBox className="flex items-center p-1 md:p-2 gap-2 md:gap-4 bg-white/95 backdrop-blur-md">
                  <div className="flex-grow flex items-center gap-2 pl-3">
                    <LocateFixed size={14} className="opacity-40" />
                    <input
                      type="text"
                      placeholder="ZIP..."
                      value={zipCode}
                      onChange={(e) => {
                        const next = e.target.value.replace(/[^0-9]/g, '').slice(0, 5);
                        setZipCode(next);
                      }}
                      onBlur={() => {
                        if (!zipCode.trim()) {
                          flyToDefault();
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleZipSearch();
                      }}
                      className="bg-transparent border-none outline-none font-sans font-bold text-[10px] md:text-xs uppercase tracking-widest w-full"
                    />
                  </div>
                  <div className="h-4 w-[1px] bg-stone-200"></div>
                  <button
                    onClick={() => setIsDrawingRadius(!isDrawingRadius)}
                    className={`flex items-center gap-1 md:gap-2 px-3 md:px-6 py-2 rounded-full font-sans font-bold text-[9px] md:text-[10px] uppercase tracking-widest transition-all ${
                      isDrawingRadius ? 'bg-[#FF4500] text-white' : 'bg-stone-100 text-stone-500 active:bg-stone-200'
                    }`}
                  >
                    <PencilLine size={12} />
                    <span className="whitespace-nowrap">{isDrawingRadius ? 'Sketching...' : 'Scribble Zone'}</span>
                  </button>
                  {drawGeo.length > 2 && (
                    <button onClick={clearDrawing} className="p-1 md:p-2 hover:bg-stone-50 rounded-full">
                      <X size={14} />
                    </button>
                  )}
                  <button
                    onClick={handleGeolocate}
                    className="flex items-center gap-1 md:gap-2 px-3 md:px-5 py-2 rounded-full font-sans font-bold text-[9px] md:text-[10px] uppercase tracking-widest transition-all bg-stone-900 text-white"
                  >
                    <LocateFixed size={12} />
                    <span className="whitespace-nowrap">{isSearchingZip ? 'Searching...' : 'Locate'}</span>
                  </button>
                </SketchyBox>
              </div>

              <div className="w-full h-full relative border-[3px] border-black rounded-[24px] md:rounded-[32px] overflow-hidden shadow-inner bg-white">
                <div ref={mapContainerRef} className="absolute inset-0"></div>
                <canvas
                  ref={canvasRef}
                  className={`absolute inset-0 ${isDrawingRadius ? 'cursor-crosshair' : 'cursor-default'}`}
                  style={{ pointerEvents: isDrawingRadius ? 'auto' : 'none' }}
                  onPointerDown={startDrawing}
                  onPointerMove={updateDrawing}
                  onPointerUp={endDrawing}
                  onPointerLeave={endDrawing}
                />
                {selectedRest && (
                  <div
                    onClick={() => setSelectedRest(null)}
                    className="absolute inset-0 bg-stone-900/10 backdrop-blur-[1px] flex items-end md:items-center justify-center p-2 md:p-4 z-50 cursor-pointer"
                  >
                    <SketchyBox
                      onClick={(e) => e.stopPropagation()}
                      className="max-w-sm w-full p-6 md:p-10 relative animate-slide-in-from-bottom-8 md:animate-zoom-in-95 shadow-2xl mb-12 md:mb-0 cursor-default"
                    >
                      <button
                        onClick={() => setSelectedRest(null)}
                        className="absolute top-4 right-4 p-2 font-sans font-bold text-lg hover:text-[#FF4500] leading-none"
                      >
                        ×
                      </button>
                      <h3 className="text-2xl md:text-4xl font-black mb-1 italic leading-tight">
                        {selectedRest.name}
                      </h3>
                      {selectedRest.rating != null && (
                        <div className="flex items-center gap-2 mb-3 md:mb-4">
                          <Star size={14} fill="#FFD700" strokeWidth={0} />
                          <span className="text-xs md:text-sm font-sans font-black ml-1 text-stone-800">
                            {selectedRest.rating}
                          </span>
                          <span className="text-[9px] md:text-[10px] font-sans font-bold opacity-30 uppercase tracking-widest">
                            Reviews
                          </span>
                        </div>
                      )}
                      <p className="font-sans font-bold text-stone-400 text-[10px] mb-4 md:mb-8 uppercase tracking-[0.15em]">
                        {selectedRest.address}
                      </p>
                      {selectedRest.description ? (
                        <div className="bg-stone-50 p-4 md:p-6 mb-6 md:mb-10 border-l-[4px] md:border-l-[6px] border-[#FF4500] rounded-sm">
                          <p className="font-medium text-sm md:text-lg leading-relaxed text-stone-700 italic">
                            "{selectedRest.description}"
                          </p>
                        </div>
                      ) : (
                        <div className="mb-4 md:mb-8"></div>
                      )}
                      <div className="flex flex-col gap-2 md:gap-3">
                        {selectedRest.phone ? (
                          <a
                            href={`tel:${selectedRest.phone}`}
                            className="flex items-center justify-center gap-2 py-3 md:py-4 bg-[#FF4500] text-white font-sans font-bold uppercase tracking-widest text-[10px] md:text-xs rounded-xl shadow-md active:bg-black"
                          >
                            <Phone size={14} /> {selectedRest.phone}
                          </a>
                        ) : (
                          <div className="flex items-center justify-center gap-2 py-3 md:py-4 bg-stone-200 text-stone-500 font-sans font-bold uppercase tracking-widest text-[10px] md:text-xs rounded-xl">
                            <Phone size={14} /> No phone
                          </div>
                        )}
                        <a
                          href={selectedRest.website}
                          className="flex items-center justify-center gap-2 py-3 md:py-4 border-2 border-black font-sans font-bold uppercase tracking-widest text-[10px] md:text-xs rounded-xl active:bg-stone-100"
                        >
                          <Globe size={14} /> Website
                        </a>
                      </div>
                    </SketchyBox>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* --- FOOTER --- */}
      <footer className="flex-none px-4 md:px-8 py-3 md:py-4 flex justify-between items-center text-[8px] md:text-[9px] font-sans font-bold border-t border-black/5 opacity-40 uppercase tracking-[0.3em] bg-white/30 backdrop-blur-sm">
        <p>Neighborhood Boy © 2026</p>
        <div className="flex gap-4"></div>
      </footer>

      {/* --- MODALS --- */}
      {isLearnMoreOpen && (
        <div
          onClick={() => setIsLearnMoreOpen(false)}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <SketchyBox
            onClick={(e) => e.stopPropagation()}
            className="max-w-3xl w-full p-6 md:p-10 relative shadow-2xl overflow-y-auto max-h-[90vh] cursor-default"
          >
            <div className="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 md:gap-10 items-start">
              <div className="flex flex-col items-center md:items-start">
                <img
                  src="/assets/neighborhood-boy-asset.png"
                  alt="Neighborhood Boy"
                  className="w-[160px] md:w-[200px] object-contain"
                />
              </div>
              <div>
                <h2 className="text-3xl md:text-4xl font-black mb-4 italic tracking-tight text-[#FF4500]">
                  Neighborhood Boy
                </h2>
                <div className="space-y-4 md:space-y-6 text-stone-700 leading-relaxed text-base md:text-lg italic">
                  <p>
                    The Neighborhood Boy dislikes large companies that prey on small businesses! Platform apps often
                    take 30% (or more) commission.
                  </p>
                  <p>
                    Instead, he likes to pick up the phone (or go online) and order local. While these restaurants do
                    not always deliver <span className="font-bold">far</span>, they will always deliver to the{' '}
                    <span className="font-bold">Neighborhood</span>.
                  </p>
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsLearnMoreOpen(false)}
              className="w-full bg-black text-white py-4 font-sans font-bold uppercase tracking-[0.2em] text-xs mt-8 hover:bg-[#FF4500] rounded-xl"
            >
              Back
            </button>
          </SketchyBox>
        </div>
      )}

      {isRecommendOpen && (
        <div
          onClick={() => setIsRecommendOpen(false)}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-2 md:p-4 cursor-pointer"
        >
          <SketchyBox
            onClick={(e) => e.stopPropagation()}
            className="max-w-xl w-full p-6 md:p-12 relative shadow-2xl overflow-y-auto max-h-[98vh] cursor-default"
          >
            <h2 className="text-2xl md:text-4xl font-black mb-6 md:mb-10 italic tracking-tight text-center">
              How can you help?
            </h2>
            <div className="grid grid-cols-2 gap-3 md:gap-6 mb-8 md:mb-12">
              <button
                onClick={() => {
                  setRecommendType('recommend');
                  resetRecommendForm();
                }}
                className={`flex flex-col items-center justify-center p-3 md:p-6 border-2 transition-all rounded-2xl ${
                  recommendType === 'recommend'
                    ? 'bg-[#FF4500] border-[#FF4500] text-white shadow-lg'
                    : 'bg-stone-50 border-black/10'
                }`}
              >
                <PlusCircle size={20} className="mb-1" />
                <span className="font-sans font-black text-[9px] md:text-[10px] uppercase tracking-widest text-center">
                  Recommend A Spot
                </span>
              </button>
              <button
                onClick={() => {
                  setRecommendType('mistake');
                  resetRecommendForm();
                }}
                className={`flex flex-col items-center justify-center p-3 md:p-6 border-2 transition-all rounded-2xl ${
                  recommendType === 'mistake'
                    ? 'bg-[#FF4500] border-[#FF4500] text-white shadow-lg'
                    : 'bg-stone-50 border-black/10'
                }`}
              >
                <AlertCircle size={20} className="mb-1" />
                <span className="font-sans font-black text-[9px] md:text-[10px] uppercase tracking-widest text-center">
                  Found a Mistake
                </span>
              </button>
            </div>
            <div className="space-y-6 md:space-y-8">
              {recommendType === 'recommend' ? (
                <>
                  <p className="text-[10px] font-sans font-bold uppercase tracking-widest text-stone-400">
                    <span className="font-black text-black">
                      Please only submit restaurants that offer local delivery.
                    </span>
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                    <div>
                      <label className="block text-[10px] font-sans font-bold mb-2 uppercase tracking-widest opacity-50">
                        Restaurant Name*
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="e.g. Maria's Kitchen"
                        value={recommendForm.name}
                        onChange={(e) => setRecommendForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full border-b-2 border-black/10 p-2 outline-none focus:border-[#FF4500] font-serif text-lg bg-transparent italic"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-sans font-bold mb-2 uppercase tracking-widest opacity-50">
                        Address*
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Street, Zip Code"
                        value={recommendForm.address}
                        onChange={(e) => setRecommendForm((prev) => ({ ...prev, address: e.target.value }))}
                        className="w-full border-b-2 border-black/10 p-2 outline-none focus:border-[#FF4500] font-serif text-lg bg-transparent italic"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-sans font-bold mb-2 uppercase tracking-widest opacity-50">
                      Why you love them (Optional)
                    </label>
                    <textarea
                      placeholder="Neighborhood staple because..."
                      value={recommendForm.description}
                      onChange={(e) => setRecommendForm((prev) => ({ ...prev, description: e.target.value }))}
                      className="w-full border-b-2 border-black/10 p-2 outline-none focus:border-[#FF4500] font-serif text-lg bg-transparent h-20 resize-none italic"
                    ></textarea>
                    <p className="text-[9px] font-sans font-bold uppercase tracking-widest text-stone-400 mt-2">
                      {getWordCount(recommendForm.description)}/200 words
                    </p>
                  </div>
                </>
              ) : (
                <div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-8">
                    <div>
                      <label className="block text-[10px] font-sans font-bold mb-2 uppercase tracking-widest opacity-50">
                        Restaurant Name*
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Restaurant name"
                        value={recommendForm.name}
                        onChange={(e) => setRecommendForm((prev) => ({ ...prev, name: e.target.value }))}
                        className="w-full border-b-2 border-black/10 p-2 outline-none focus:border-[#FF4500] font-serif text-lg bg-transparent italic"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-sans font-bold mb-2 uppercase tracking-widest opacity-50">
                        Address*
                      </label>
                      <input
                        required
                        type="text"
                        placeholder="Street, Zip Code"
                        value={recommendForm.address}
                        onChange={(e) => setRecommendForm((prev) => ({ ...prev, address: e.target.value }))}
                        className="w-full border-b-2 border-black/10 p-2 outline-none focus:border-[#FF4500] font-serif text-lg bg-transparent italic"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-[10px] font-sans font-bold mb-2 uppercase tracking-widest opacity-50">
                        What's wrong?*
                      </label>
                      <textarea
                        placeholder="Information needs updating..."
                        value={recommendForm.description}
                        onChange={(e) => setRecommendForm((prev) => ({ ...prev, description: e.target.value }))}
                        className="w-full border-b-2 border-black/10 p-2 outline-none focus:border-[#FF4500] font-serif text-lg bg-transparent h-32 resize-none italic"
                      ></textarea>
                    </div>
                  </div>
                  <p className="text-[9px] font-sans font-bold uppercase tracking-widest text-stone-400 mt-2">
                    {getWordCount(recommendForm.description)}/200 words
                  </p>
                </div>
              )}
              <button
                onClick={handleSubmitRecommend}
                disabled={
                  isSubmittingRecommend ||
                  (recommendType === 'recommend'
                    ? !recommendForm.name.trim() || !recommendForm.address.trim()
                    : !recommendForm.name.trim() ||
                      !recommendForm.address.trim() ||
                      !recommendForm.description.trim()) ||
                  getWordCount(recommendForm.description) > 200
                }
                className={`w-full py-4 md:py-6 font-sans font-bold uppercase tracking-[0.2em] text-xs mt-2 rounded-2xl ${
                  isSubmittingRecommend ||
                  (recommendType === 'recommend'
                    ? !recommendForm.name.trim() || !recommendForm.address.trim()
                    : !recommendForm.name.trim() ||
                      !recommendForm.address.trim() ||
                      !recommendForm.description.trim()) ||
                  getWordCount(recommendForm.description) > 200
                    ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                    : 'bg-black text-white hover:bg-[#FF4500]'
                }`}
              >
                {isSubmittingRecommend ? 'Submitting...' : 'Submit to the Neighborhood'}
              </button>
            </div>
          </SketchyBox>
        </div>
      )}

      {isAboutOpen && (
        <div
          onClick={() => setIsAboutOpen(false)}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer"
        >
          <SketchyBox
            onClick={(e) => e.stopPropagation()}
            className="max-w-2xl w-full p-6 md:p-10 relative shadow-2xl overflow-y-auto max-h-[90vh] cursor-default"
          >
            <h2 className="text-3xl md:text-4xl font-black mb-6 italic tracking-tight text-[#FF4500]">About</h2>
            <div className="space-y-6 text-stone-700 leading-relaxed text-base md:text-lg">
              <p className="font-medium">
                <span className="font-bold">Neighborhood boy</span> is an ever-growing list of restaurants that you can
                call (or order online) to deliver local. The money that you'll save on delivery fees can go straight into
                tips (and even then, it'll probably still be cheaper for you!).
              </p>
              <div className="space-y-4">
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === 'small' ? null : 'small')}
                    className="w-full flex items-center gap-3 font-sans font-bold uppercase tracking-widest text-xs md:text-sm text-stone-600 mb-2 text-left"
                  >
                    <span className="text-[#FF4500]">{openFaq === 'small' ? '▾' : '›'}</span>
                    Why is this list so small?
                  </button>
                  {openFaq === 'small' && (
                    <p className="text-[11px] md:text-sm text-stone-600">
                      This is a passion project and I am just one person! Please send in recommendations or flag any
                      mistakes. The goal is to make a comprehensive list for all New Yorkers.
                    </p>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === 'help' ? null : 'help')}
                    className="w-full flex items-center gap-3 font-sans font-bold uppercase tracking-widest text-xs md:text-sm text-stone-600 mb-2 text-left"
                  >
                    <span className="text-[#FF4500]">{openFaq === 'help' ? '▾' : '›'}</span>
                    This is a great idea! How can I help?
                  </button>
                  {openFaq === 'help' && (
                    <p className="text-[11px] md:text-sm text-stone-600">
                      Beyond submitting restaurants, feel free to reach out to me at [placeholder@email.com] to help with
                      this project. There is no purpose to this project other than hating on delivery services (which I
                      personally believe are extremely predatorial!)
                    </p>
                  )}
                </div>
                <div>
                  <button
                    type="button"
                    onClick={() => setOpenFaq(openFaq === 'ai' ? null : 'ai')}
                    className="w-full flex items-center gap-3 font-sans font-bold uppercase tracking-widest text-xs md:text-sm text-stone-600 mb-2 text-left"
                  >
                    <span className="text-[#FF4500]">{openFaq === 'ai' ? '▾' : '›'}</span>
                    Did you use AI?
                  </button>
                  {openFaq === 'ai' && (
                    <p className="text-[11px] md:text-sm text-stone-600">
                      I am not a software engineer by trade, so I did use AI to help code this. While I am not the
                      biggest fan of AI, I do believe we can use it in certain ways for good. All data collected was
                      manual and small drawings were created on my iPad!
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button
              onClick={() => setIsAboutOpen(false)}
              className="w-full bg-black text-white py-4 font-sans font-bold uppercase tracking-[0.2em] text-xs mt-8 hover:bg-[#FF4500] rounded-xl"
            >
              Back
            </button>
          </SketchyBox>
        </div>
      )}
    </div>
  );
};

export default App;
