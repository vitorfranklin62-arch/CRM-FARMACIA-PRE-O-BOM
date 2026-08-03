import type { Metadata } from "next";
import { headers } from "next/headers";
import { loja } from "@/config/loja";
import { getProdutosDestaque } from "@/lib/produtos-destaque";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Hero } from "@/components/site/Hero";
import { PromocoesGrid } from "@/components/site/PromocoesGrid";
import { BuscaRapida } from "@/components/site/BuscaRapida";
import { Servicos } from "@/components/site/Servicos";
import { ComoComprar } from "@/components/site/ComoComprar";
import { OndeEstamos } from "@/components/site/OndeEstamos";
import { SiteFooter } from "@/components/site/SiteFooter";
import { WhatsAppFloatingButton } from "@/components/site/WhatsAppFloatingButton";
import { ScrollReveal } from "@/components/site/ScrollReveal";

const title = "Farmácia Preço Bom — Entrega em toda Salvador | Rua Nossa Senhora do Carmo";
const description =
  "Farmácia Preço Bom, na Rua Nossa Senhora do Carmo, 100, em Salvador/BA. Entrega para toda a cidade, atendimento rápido pelo WhatsApp e promoções toda semana.";

export const metadata: Metadata = {
  metadataBase: new URL(loja.siteUrl),
  title,
  description,
  alternates: { canonical: loja.siteUrl },
  openGraph: {
    title,
    description,
    url: loja.siteUrl,
    siteName: loja.nome,
    locale: "pt_BR",
    type: "website",
    images: [{ url: "/assets/site/og-image", width: 1200, height: 630, alt: loja.nome }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: ["/assets/site/og-image"],
  },
  icons: {
    icon: [{ url: "/assets/site/icon", type: "image/png", sizes: "512x512" }],
    apple: [{ url: "/assets/site/apple-icon", type: "image/png", sizes: "180x180" }],
  },
};

export default async function HomePage() {
  const { produtos } = await getProdutosDestaque();
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Pharmacy",
    name: loja.nome,
    image: `${loja.siteUrl}/assets/site/og-image`,
    telephone: `+${loja.whatsapp}`,
    priceRange: "$",
    address: {
      "@type": "PostalAddress",
      streetAddress: loja.endereco.logradouro,
      addressLocality: loja.endereco.cidade,
      addressRegion: loja.endereco.estado,
      postalCode: loja.endereco.cep || undefined,
      addressCountry: "BR",
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: loja.endereco.geo.latitude,
      longitude: loja.endereco.geo.longitude,
    },
    areaServed: "Salvador",
    sameAs: [loja.instagramUrl],
    openingHoursSpecification: loja.horarios.map((h) => ({
      "@type": "OpeningHoursSpecification",
      dayOfWeek: h.dia,
      opens: h.abertura,
      closes: h.fechamento,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ScrollReveal />
      <SiteHeader />
      <main>
        <Hero />
        <PromocoesGrid produtos={produtos} />
        <BuscaRapida produtos={produtos} />
        <Servicos />
        <ComoComprar />
        <OndeEstamos />
      </main>
      <SiteFooter />
      <WhatsAppFloatingButton />
    </>
  );
}
