import React from "react";
import { createRoot } from "react-dom/client";
import { propertyBase } from "./property-base";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing app root");
createRoot(root).render(
  <React.StrictMode>
    <main className="app-shell">
      <header className="page-header">
        <div>
          <p className="eyebrow">House landscape</p>
          <h1>Yard planner</h1>
          <p className="intro">
            A fixed property map for planting and irrigation planning.
          </p>
        </div>
        <p className="dimensions">40 × 120 ft · approximately 4,800 sq ft</p>
      </header>
      <div className="map-layout">
        <figure className="map-card">
          <img
            className="base-map"
            src="/property-base.svg"
            alt="Property plan, with backyard at the top, driveway at the bottom, and north to the left"
          />
          <figcaption>
            Approximate structural trace. Dashed edges indicate inferred
            positions.
          </figcaption>
        </figure>
        <aside className="map-notes" aria-label="Map information">
          <h2>Property orientation</h2>
          <dl>
            <div>
              <dt>Top</dt>
              <dd>East · backyard</dd>
            </div>
            <div>
              <dt>Bottom</dt>
              <dd>West · driveway</dd>
            </div>
            <div>
              <dt>Left</dt>
              <dd>North</dd>
            </div>
            <div>
              <dt>Right</dt>
              <dd>South</dd>
            </div>
          </dl>
          <p>{propertyBase.tracing.note}</p>
        </aside>
      </div>
    </main>
  </React.StrictMode>,
);
