import { createRouter, createWebHistory } from "vue-router";
import HomeView from "../views/HomeView.vue";
import AIChatView from "../views/AIChatView.vue";

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: "/", name: "home", component: HomeView },
    { path: "/ai", name: "ai", component: AIChatView },
  ],
});

export default router;
