"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, X } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Label, Input, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { createClient } from "@/lib/supabase/client";
import { logAudit } from "@/lib/audit";
import { produtoCreateSchema } from "@/lib/validation";
import { slugify } from "@/lib/utils";
import { revalidarSitePublico } from "@/app/(app)/produtos/actions";
import type { Produto } from "@/types/database";

const CATEGORIAS = [
  { value: "medicamento_isento", label: "Medicamento isento de receita" },
  { value: "higiene", label: "Higiene" },
  { value: "dermocosmetico", label: "Dermocosmético" },
  { value: "infantil", label: "Infantil" },
  { value: "outros", label: "Outros" },
] as const;

export function ProdutoForm({
  open,
  onClose,
  produto,
}: {
  open: boolean;
  onClose: () => void;
  produto: Produto | null;
}) {
  const [nome, setNome] = useState("");
  const [laboratorio, setLaboratorio] = useState("");
  const [preco, setPreco] = useState("");
  const [estoque, setEstoque] = useState("");
  const [sku, setSku] = useState("");

  // Vitrine do site (precobom.com.br) — só relevante quando destaqueSite está ligado
  const [destaqueSite, setDestaqueSite] = useState(false);
  const [exigeReceita, setExigeReceita] = useState(false);
  const [categoria, setCategoria] = useState("");
  const [principioAtivo, setPrincipioAtivo] = useState("");
  const [precoPromocional, setPrecoPromocional] = useState("");
  const [promoAte, setPromoAte] = useState("");
  const [imagemUrl, setImagemUrl] = useState<string | null>(null);
  const [uploadingImagem, setUploadingImagem] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) {
      setNome(produto?.nome ?? "");
      setLaboratorio(produto?.laboratorio ?? "");
      setPreco(produto ? String(produto.preco) : "");
      setEstoque(produto ? String(produto.estoque) : "");
      setSku(produto?.sku ?? "");
      setDestaqueSite(produto?.destaque_site ?? false);
      setExigeReceita(produto?.exige_receita ?? false);
      setCategoria(produto?.categoria ?? "");
      setPrincipioAtivo(produto?.principio_ativo ?? "");
      setPrecoPromocional(produto?.preco_promocional != null ? String(produto.preco_promocional) : "");
      setPromoAte(produto?.promo_ate ?? "");
      setImagemUrl(produto?.imagem_url ?? null);
      setError(null);
    }
  }, [open, produto]);

  async function handleImagemChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setUploadingImagem(true);
    setError(null);
    try {
      const supabase = createClient();
      const extensao = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const caminho = `${produto?.id ?? crypto.randomUUID()}-${Date.now()}.${extensao}`;

      const { error: uploadError } = await supabase.storage
        .from("produtos-imagens")
        .upload(caminho, file, { upsert: true, cacheControl: "3600" });

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("produtos-imagens").getPublicUrl(caminho);
      setImagemUrl(data.publicUrl);
    } catch {
      setError("Não foi possível enviar a imagem. Tente novamente.");
    } finally {
      setUploadingImagem(false);
    }
  }

  function toggleExigeReceita(checked: boolean) {
    setExigeReceita(checked);
    // medicamento com receita não pode ser destaque/promoção no site
    if (checked) setDestaqueSite(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (destaqueSite && !categoria) {
      setError("Escolha uma categoria pra mostrar este produto no site.");
      return;
    }

    const parsed = produtoCreateSchema.safeParse({
      nome,
      laboratorio: laboratorio || null,
      preco: Number(preco.replace(",", ".")),
      estoque: Number(estoque || 0),
      sku: sku || null,
      principio_ativo: principioAtivo || null,
      categoria: destaqueSite ? categoria : null,
      exige_receita: exigeReceita,
      preco_promocional: precoPromocional ? Number(precoPromocional.replace(",", ".")) : null,
      promo_ate: promoAte || null,
      imagem_url: imagemUrl,
      destaque_site: destaqueSite,
      slug: produto?.slug ?? null,
    });

    if (!parsed.success) {
      setError("Preencha nome, preço (número) e estoque (número inteiro) corretamente.");
      return;
    }

    setSaving(true);
    const supabase = createClient();

    // slug só é gerado quando o produto entra na vitrine e ainda não tem um
    const payload = { ...parsed.data };
    if (destaqueSite && !payload.slug) {
      payload.slug = slugify(nome);
    }

    let { data, error: dbError } = produto
      ? await supabase.from("produtos").update(payload).eq("id", produto.id).select("id").single()
      : await supabase.from("produtos").insert(payload).select("id").single();

    // slug colidiu com outro produto — tenta uma vez com um sufixo curto
    if (dbError?.code === "23505" && dbError.message.includes("slug") && payload.slug) {
      payload.slug = `${payload.slug}-${Math.random().toString(36).slice(2, 6)}`;
      ({ data, error: dbError } = produto
        ? await supabase.from("produtos").update(payload).eq("id", produto.id).select("id").single()
        : await supabase.from("produtos").insert(payload).select("id").single());
    }

    setSaving(false);

    if (dbError) {
      setError(
        dbError.code === "23505" ? "Já existe um produto com esse SKU." : "Não foi possível salvar o produto."
      );
      return;
    }

    await logAudit(supabase, produto ? "produto_atualizado" : "produto_criado", "produtos", data?.id, {
      nome: parsed.data.nome,
    });

    revalidarSitePublico().catch(() => {});

    onClose();
    router.refresh();
  }

  return (
    <Modal open={open} onClose={onClose} title={produto ? "Editar produto" : "Novo produto"}>
      <form onSubmit={handleSubmit} className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
        <div>
          <Label htmlFor="nome">Nome</Label>
          <Input id="nome" value={nome} onChange={(e) => setNome(e.target.value)} required maxLength={300} />
        </div>
        <div>
          <Label htmlFor="laboratorio">Laboratório</Label>
          <Input id="laboratorio" value={laboratorio} onChange={(e) => setLaboratorio(e.target.value)} maxLength={200} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="preco">Preço (R$)</Label>
            <Input
              id="preco"
              inputMode="decimal"
              value={preco}
              onChange={(e) => setPreco(e.target.value)}
              placeholder="0,00"
              required
            />
          </div>
          <div>
            <Label htmlFor="estoque">Estoque</Label>
            <Input
              id="estoque"
              type="number"
              min={0}
              step={1}
              value={estoque}
              onChange={(e) => setEstoque(e.target.value)}
              placeholder="0"
              required
            />
          </div>
        </div>
        <div>
          <Label htmlFor="sku">SKU (opcional)</Label>
          <Input id="sku" value={sku} onChange={(e) => setSku(e.target.value)} maxLength={100} />
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
          <input
            type="checkbox"
            checked={exigeReceita}
            onChange={(e) => toggleExigeReceita(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300"
          />
          Exige receita médica
        </label>

        <div className="rounded-xl border border-gray-200 p-4 dark:border-white/10">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-900 dark:text-white">
            <input
              type="checkbox"
              checked={destaqueSite}
              disabled={exigeReceita}
              onChange={(e) => setDestaqueSite(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300"
            />
            Mostrar na vitrine do site (precobom.com.br)
          </label>
          {exigeReceita ? (
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              Medicamentos com receita não aparecem nas promoções do site.
            </p>
          ) : (
            <p className="mt-1.5 text-xs text-gray-400 dark:text-gray-500">
              Aparece na home em até 5 minutos (ou na hora, ao salvar).
            </p>
          )}

          {destaqueSite && !exigeReceita && (
            <div className="mt-4 space-y-4">
              <div>
                <Label htmlFor="categoria">Categoria</Label>
                <Select id="categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </div>

              <div>
                <Label htmlFor="principioAtivo">Princípio ativo (opcional)</Label>
                <Input
                  id="principioAtivo"
                  value={principioAtivo}
                  onChange={(e) => setPrincipioAtivo(e.target.value)}
                  maxLength={200}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="precoPromocional">Preço promocional (opcional)</Label>
                  <Input
                    id="precoPromocional"
                    inputMode="decimal"
                    value={precoPromocional}
                    onChange={(e) => setPrecoPromocional(e.target.value)}
                    placeholder="0,00"
                  />
                </div>
                <div>
                  <Label htmlFor="promoAte">Promoção até</Label>
                  <Input
                    id="promoAte"
                    type="date"
                    value={promoAte}
                    onChange={(e) => setPromoAte(e.target.value)}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="imagem">Foto do produto</Label>
                <div className="flex items-center gap-3">
                  {imagemUrl ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element -- preview de upload, não faz sentido otimizar com next/image */}
                      <img
                        src={imagemUrl}
                        alt="Prévia da foto do produto"
                        className="h-16 w-16 rounded-lg border border-gray-200 object-contain dark:border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => setImagemUrl(null)}
                        aria-label="Remover foto"
                        className="absolute -right-1.5 -top-1.5 rounded-full bg-gray-700 p-0.5 text-white hover:bg-gray-900"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  ) : (
                    <span className="flex h-16 w-16 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300 dark:border-white/15">
                      <ImagePlus size={20} />
                    </span>
                  )}
                  <label className="cursor-pointer text-sm font-medium text-brand-600 hover:underline dark:text-brand-400">
                    {uploadingImagem ? "Enviando..." : imagemUrl ? "Trocar foto" : "Enviar foto"}
                    <input
                      id="imagem"
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={handleImagemChange}
                      disabled={uploadingImagem}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  Sem foto, o site mostra um ícone genérico no lugar.
                </p>
              </div>
            </div>
          )}
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={saving || uploadingImagem}>
            {saving ? "Salvando..." : "Salvar"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
