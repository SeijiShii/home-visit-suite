import "./style.css";
import "leaflet/dist/leaflet.css";
import { router } from "./router";

const app = document.getElementById("app")!;

// シンプルなクライアントサイドルーター
function render() {
  const page = router.resolve(window.location.hash);
  page(app);
}

window.addEventListener("hashchange", render);
render();
