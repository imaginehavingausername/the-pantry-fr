"use client";

import { useRef, useState } from "react";
import { UploadButton } from "~/lib/uploadthing"; // adjust to wherever your app exports these — see README
import { FOOD_CATEGORIES, FoodCategoryName } from "~/lib/receiptGemini";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";

interface MatchedItem {
  food_item_id: string;
  name: string;
  quantity_delta: number;
  confidence: "high" | "medium" | "low";
  include: boolean; // review-page-only field
}

interface NewItem {
  name: string;
  quantity: number;
  suggested_categories: FoodCategoryName[];
  suggested_keywords: string[];
  confidence: "high" | "medium" | "low";
  include: boolean; // review-page-only field
  expirationDate: string; // user must fill in — required by schema
  placement: string; // user must fill in — required by schema
  categories: FoodCategoryName[]; // editable, pre-filled from suggested_categories
  keywords: string; // comma-separated, editable, pre-filled from suggested_keywords
  imageUrl: string; // set once UploadThing finishes
}

interface UnmatchedLine {
  raw_text: string;
  reason: string;
}

// Resize an image file client-side so uploads stay small and fast.
async function resizeImage(file: File, maxDimension = 1800, quality = 0.82): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob: Blob = await new Promise((resolve) =>
    canvas.toBlob((b) => resolve(b as Blob), "image/jpeg", quality)
  );
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

export default function ReceiptReviewPage() {
  const [images, setImages] = useState<File[]>([]);
  const [scanning, setScanning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [matchedItems, setMatchedItems] = useState<MatchedItem[]>([]);
  const [newItems, setNewItems] = useState<NewItem[]>([]);
  const [unmatchedLines, setUnmatchedLines] = useState<UnmatchedLine[]>([]);
  const [scanned, setScanned] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);

  // camera capture state
  const [cameraOpen, setCameraOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const resized = await Promise.all(files.map((f) => resizeImage(f)));
    setImages((prev) => [...prev, ...resized]);
  }

  async function openCamera() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOpen(true);
    } catch (err) {
      setError("Unable to access camera.");
    }
  }

  async function captureFromCamera() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b)));
    if (!blob) return;
    const file = new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type });
    const resized = await resizeImage(file);
    setImages((prev) => [...prev, resized]);
    closeCamera();
  }

  function closeCamera() {
    setCameraOpen(false);
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        // @ts-ignore
        videoRef.current.srcObject = null;
      } catch {}
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      images.forEach((img) => formData.append("images", img));

      const res = await fetch("/api/receipt/scan", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed.");

      setMatchedItems(data.matched_items.map((m: Omit<MatchedItem, "include">) => ({ ...m, include: true })));
      setNewItems(
        data.new_items.map(
          (n: Omit<NewItem, "include" | "expirationDate" | "placement" | "categories" | "keywords" | "imageUrl">) => ({
            ...n,
            include: true,
            expirationDate: "",
            placement: "",
            categories: n.suggested_categories ?? [],
            keywords: (n.suggested_keywords ?? []).join(", "),
            imageUrl: "",
          })
        )
      );
      setUnmatchedLines(data.unmatched_lines);
      setScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setScanning(false);
    }
  }

  const newItemsMissingRequiredFields = newItems.some(
    (n) => n.include && (!n.expirationDate || !n.placement)
  );

  function toggleCategory(index: number, category: FoodCategoryName) {
    const copy = [...newItems];
    const current = copy[index].categories;
    copy[index].categories = current.includes(category)
      ? current.filter((c) => c !== category)
      : [...current, category];
    setNewItems(copy);
  }

  async function handleConfirm() {
    setConfirming(true);
    setError(null);
    try {
      const payload = {
        matched_items: matchedItems
          .filter((m) => m.include)
          .map((m) => ({ food_item_id: m.food_item_id, quantity_delta: m.quantity_delta })),
        new_items: newItems
          .filter((n) => n.include)
          .map((n) => ({
            name: n.name,
            quantity: n.quantity,
            expirationDate: new Date(n.expirationDate).toISOString(),
            placement: n.placement,
            categories: n.categories,
            keywords: n.keywords.split(",").map((s) => s.trim()).filter(Boolean),
            imageUrl: n.imageUrl || undefined,
          })),
      };

      const res = await fetch("/api/receipt/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Confirm failed.");

      setDoneMessage(`Updated ${data.updatedCount} item(s), added ${data.createdCount} new item(s).`);
      setScanned(false);
      setImages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setConfirming(false);
    }
  }
  return (
    <div className="max-w-lg mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Scan Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="text-destructive mb-2">{error}</div>}
          {doneMessage && <div className="text-green-600 mb-2">{doneMessage}</div>}

          {!scanned && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2 items-center">
                <Button variant="outline" onClick={openCamera} disabled={scanning}>
                  Open Camera
                </Button>
                <label className="text-sm text-muted-foreground">or</label>
                <div>
                  <Input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    multiple
                    onChange={handleFileSelect}
                  />
                  <div className="text-xs text-muted-foreground mt-1">Use file input on desktop</div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">{images.length} image(s) selected</div>
                <Button onClick={handleScan} disabled={images.length === 0 || scanning}>
                  {scanning ? (
                    <span className="flex items-center gap-2">
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                        <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
                      </svg>
                      Scanning…
                    </span>
                  ) : (
                    "Scan Receipt"
                  )}
                </Button>
              </div>
            </div>
          )}

          {cameraOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="bg-card rounded-lg overflow-hidden w-full max-w-md">
                <div className="relative">
                  <div className="aspect-[3/4] bg-black">
                    <video ref={videoRef} className="w-full h-full object-cover" playsInline />
                  </div>

                  <button
                    onClick={closeCamera}
                    className="absolute top-3 left-3 bg-background/80 text-sm px-3 py-1 rounded-md shadow"
                  >
                    Close
                  </button>

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
                    <button
                      onClick={captureFromCamera}
                      className="bg-primary text-primary-foreground rounded-full w-16 h-16 flex items-center justify-center shadow-lg"
                      aria-label="Capture"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {scanned && (
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-sm font-medium">Existing Items ({matchedItems.length})</h3>
                <div className="mt-2 grid gap-3">
                  {matchedItems.map((item, i) => (
                    <div key={item.food_item_id} className="flex items-center justify-between gap-4 p-3 border rounded-md bg-background">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={item.include}
                          onChange={(e) => {
                            const copy = [...matchedItems];
                            copy[i].include = e.target.checked;
                            setMatchedItems(copy);
                          }}
                        />
                        <div>
                          <div className="font-medium">{item.name}</div>
                          {item.confidence !== "high" && <div className="text-orange-500 text-xs">{item.confidence} confidence</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm">+</span>
                        <Input
                          type="number"
                          value={String(item.quantity_delta)}
                          onChange={(e) => {
                            const copy = [...matchedItems];
                            copy[i].quantity_delta = Number(e.target.value);
                            setMatchedItems(copy);
                          }}
                          className="w-20"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium">New Items ({newItems.length})</h3>
                <div className="mt-2 grid gap-3">
                  {newItems.map((item, i) => (
                    <div key={i} className="p-3 border rounded-md bg-background">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={item.include}
                          onChange={(e) => {
                            const copy = [...newItems];
                            copy[i].include = e.target.checked;
                            setNewItems(copy);
                          }}
                        />
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const copy = [...newItems];
                            copy[i].name = e.target.value;
                            setNewItems(copy);
                          }}
                          className="flex-1"
                        />
                        {item.confidence !== "high" && <div className="text-orange-500 text-xs">{item.confidence}</div>}
                      </div>

                      <div className="mt-3 grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Qty</label>
                          <Input
                            type="number"
                            value={String(item.quantity)}
                            onChange={(e) => {
                              const copy = [...newItems];
                              copy[i].quantity = Number(e.target.value);
                              setNewItems(copy);
                            }}
                          />
                        </div>

                        <div>
                          <label className="text-xs text-muted-foreground">Expiration</label>
                          <Input
                            type="date"
                            value={item.expirationDate}
                            onChange={(e) => {
                              const copy = [...newItems];
                              copy[i].expirationDate = e.target.value;
                              setNewItems(copy);
                            }}
                            className={item.include && !item.expirationDate ? "border-destructive" : undefined}
                          />
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="text-xs text-muted-foreground">Placement</label>
                        <Input
                          value={item.placement}
                          onChange={(e) => {
                            const copy = [...newItems];
                            copy[i].placement = e.target.value;
                            setNewItems(copy);
                          }}
                          className={item.include && !item.placement ? "border-destructive" : undefined}
                        />
                      </div>

                      <div className="mt-3">
                        <div className="text-xs text-muted-foreground">Categories (suggested)</div>
                        <div className="flex flex-wrap gap-2 mt-2">
                          {FOOD_CATEGORIES.map((cat) => (
                            <label key={cat} className="text-sm">
                              <input
                                type="checkbox"
                                checked={item.categories.includes(cat)}
                                onChange={() => toggleCategory(i, cat)}
                              />
                              <span className="ml-1">{cat}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <div className="mt-3">
                        <label className="text-xs text-muted-foreground">Keywords</label>
                        <Input
                          value={item.keywords}
                          onChange={(e) => {
                            const copy = [...newItems];
                            copy[i].keywords = e.target.value;
                            setNewItems(copy);
                          }}
                        />
                      </div>

                      <div className="mt-3 flex items-center gap-3">
                        <div className="text-sm">Image</div>
                        {item.imageUrl ? (
                          <div className="text-green-600">Uploaded ✓</div>
                        ) : (
                          <UploadButton
                            endpoint="imageUploader"
                            onClientUploadComplete={(res) => {
                              const url = res?.[0]?.url;
                              if (!url) return;
                              const copy = [...newItems];
                              copy[i].imageUrl = url;
                              setNewItems(copy);
                            }}
                            onUploadError={(err: Error) => {
                              setError(`Image upload failed for "${item.name}": ${err.message}`);
                            }}
                          />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {unmatchedLines.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium">Couldn't Parse ({unmatchedLines.length})</h3>
                  <ul className="mt-2 list-disc pl-5 text-sm text-muted-foreground">
                    {unmatchedLines.map((line, i) => (
                      <li key={i}>
                        "{line.raw_text}" — {line.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {newItemsMissingRequiredFields && (
                <div className="text-destructive">Every included new item needs an expiration date and placement before you can confirm.</div>
              )}

              {/* actions moved to CardFooter for consistent placement */}
            </div>
          )}
        </CardContent>
        <CardFooter className="justify-end">
          <Button
            onClick={handleConfirm}
            disabled={confirming || newItemsMissingRequiredFields}
            variant="default"
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {confirming ? (
              <span className="flex items-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                  <path d="M4 12a8 8 0 018-8" stroke="currentColor" strokeWidth="4" strokeLinecap="round" className="opacity-75" />
                </svg>
                Saving…
              </span>
            ) : (
              "Confirm & Update Pantry"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}