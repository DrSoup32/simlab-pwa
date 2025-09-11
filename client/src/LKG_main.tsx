import React from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import Stage from "./views/Stage";
import Control from "./views/Control";
import Learner from "./views/Learner";
import ControlLite from "./views/ControlLite";
import "./ui/theme.css";

const router = createHashRouter([
  {
    path: "/",
    element: (
      <div style={{ padding: 20 }}>
        <h1>SimLab PWA</h1>
        <p>
          <a href="#/stage">Stage</a> | <a href="#/control">Control</a> |{" "}
          <a href="#/learner">Learner</a> | <a href="#/control-lite">Control&nbsp;Lite</a>
        </p>
      </div>
    ),
  },
  { path: "/control", element: <Control /> },
  { path: "/control-lite", element: <ControlLite /> },
  { path: "/learner", element: <Learner /> },
  { path: "/stage", element: <Stage /> },
]);

createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
