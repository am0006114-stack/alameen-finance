import { Suspense } from "react";
import SiteHeader from "@/components/site/SiteHeader";
import SiteFooter from "@/components/site/SiteFooter";
import MobileBottomNav from "@/components/site/MobileBottomNav";
import TrackClient from "./TrackClient";

export default function TrackPage() {
  return (
    <>
      <SiteHeader active="track" />
      <Suspense fallback={null}>
        <TrackClient />
      </Suspense>
      <SiteFooter />
      <MobileBottomNav active="track" />
    </>
  );
}
