"use client";

import { useRef, useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { UploadButton } from "~/lib/uploadthing"; // adjust to wherever your app exports these — see README
import { FOOD_CATEGORIES, type FoodCategoryName } from "~/lib/receiptGemini";
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
    canvas.toBlob((b) => resolve(b!), "image/jpeg", quality)
  );
  return new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" });
}

export default function ReceiptReviewPage() {
  const router = useRouter();
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [latestPreview, setLatestPreview] = useState<string | null>(null);
  const [sessionImages, setSessionImages] = useState<File[]>([]);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const resized = await Promise.all(files.map((f) => resizeImage(f)));
    setImages((prev) => [...prev, ...resized]);
  }

  async function openCamera() {
    setError(null);
    // open the modal first so the video element mounts
    setCameraOpen(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      // wait a tick for the video element to mount
      await new Promise((r) => setTimeout(r, 60));
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // mute so autoplay isn't blocked
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
    } catch {
      setError("Unable to access camera.");
      setCameraOpen(false);
    }
  }

  async function captureFromCamera() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    // ensure we have a stream; if not, try to acquire one
    if (!streamRef.current) {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        streamRef.current = s;
        if (videoRef.current) videoRef.current.srcObject = s;
      } catch (err) {
        setError("Unable to access camera.");
        return;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Try ImageCapture API first (better on some mobile devices)
    let gotBlob: Blob | null = null;
    try {
      const track = streamRef.current?.getVideoTracks()?.[0];
      if (track && (window as any).ImageCapture) {
        try {
          const ic = new (window as any).ImageCapture(track);
          // try takePhoto (may throw on some devices), fallback to grabFrame if available
          if (ic.takePhoto) {
            gotBlob = await ic.takePhoto();
          } else if (ic.grabFrame) {
            const frame = await ic.grabFrame();
            const c = document.createElement("canvas");
            c.width = frame.width;
            c.height = frame.height;
            const cx = c.getContext("2d");
            cx?.drawImage(frame, 0, 0);
            gotBlob = await new Promise((res) => c.toBlob((b) => b && res(b)));
          }
        } catch {
          gotBlob = null;
        }
      }
    } catch {
      gotBlob = null;
    }

    // fallback to canvas capture if ImageCapture not available or failed
    if (!gotBlob) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      gotBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b)));
      if (!gotBlob) return;
    }

    const file = new File([gotBlob], `scan-${Date.now()}.jpg`, { type: gotBlob.type || "image/jpeg" });
    const resized = await resizeImage(file);
    // keep captured photos in a session buffer until the user confirms (checkmark)
    setSessionImages((prev) => [...prev, resized]);
    // create a tiny preview thumbnail for feedback
    try {
      const url = URL.createObjectURL(gotBlob);
      if (latestPreview) URL.revokeObjectURL(latestPreview);
      setLatestPreview(url);
    } catch {}

    // ensure the video keeps playing after capture — reattach stream and play
    try {
      if (streamRef.current && videoRef.current) {
        videoRef.current.srcObject = streamRef.current;
        videoRef.current.muted = true;
        await videoRef.current.play();
      }
    } catch {}

    // verify stream is still live; if not, try to reacquire camera silently
    try {
      const tracks = streamRef.current?.getTracks() ?? [];
      const anyLive = tracks.some((t) => t.readyState === "live");
      if (!anyLive) {
        try {
          const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
          streamRef.current = newStream;
          if (videoRef.current) {
            videoRef.current.srcObject = newStream;
            videoRef.current.muted = true;
            await videoRef.current.play();
          }
        } catch {
          // ignore — user can reopen camera
        }
      }
    } catch {}
  }

  function closeCamera() {
    // discard any session-captured images (Close = cancel)
    setSessionImages([]);
    if (latestPreview) {
      try {
        URL.revokeObjectURL(latestPreview);
      } catch {}
      setLatestPreview(null);
    }
    setCameraOpen(false);
    if (videoRef.current) {
      try {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      } catch {}
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (latestPreview) {
        try {
          URL.revokeObjectURL(latestPreview);
        } catch {}
      }
    };
  }, [latestPreview]);

  async function handleScan() {
    setScanning(true);
    setError(null);
    try {
      const formData = new FormData();
      images.forEach((img) => formData.append("images", img));

      const res = await fetch("/api/receipt/scan", { method: "POST", body: formData });

      const contentType = res.headers.get("content-type") ?? "";
      if (!contentType.includes("application/json")) {
        // Not JSON at all — almost always a platform-level error page (timeout, 502, etc.)
        // rather than anything our own API route returned.
        throw new Error(
          `Scan failed (server returned a non-JSON ${res.status} response). Try again in a minute.`
        );
      }

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
    const target = copy[index];
    if (!target) return;
    const current = target.categories;
    target.categories = current.includes(category)
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
    <div className="max-w-lg mx-auto p-6">       <Button
         variant="outline"
         className="border-[#528F04] text-[#528F04] mb-4 bg-transparent text-sm sm:text-base"
         onClick={() => router.back()}
       >
         <ArrowLeft className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
         Go back
       </Button>      <Card>
        <CardHeader>
          <CardTitle>Scan Receipt</CardTitle>
        </CardHeader>
        <CardContent>
          {error && <div className="text-destructive mb-2">{error}</div>}
          {doneMessage && <div className="text-green-600 mb-2">{doneMessage}</div>}

          {!scanned && (
            <div className="flex flex-col items-center gap-6 py-6">
              <div className="text-center">
                <div className="mx-auto mb-2 h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <svg className="h-6 w-6 text-primary-foreground" viewBox="0 0 24 24" fill="none">
                    <path d="M3 7h18M7 3h10l1 4H6l1-4zM5 21h14a1 1 0 001-1V9H4v11a1 1 0 001 1z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="text-lg font-semibold">Scan your receipt</div>
                <div className="text-sm text-muted-foreground">Use your phone camera or choose files from your device.</div>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-3">
                <Button variant="outline" onClick={openCamera} disabled={scanning}>
                  Open Camera
                </Button>

                <div className="text-sm text-muted-foreground hidden sm:block">or</div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  multiple
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <Button variant="ghost" onClick={() => fileInputRef.current?.click()}>
                  Choose files
                </Button>
              </div>

              <div className="w-full flex items-center justify-between">
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
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-auto">
              <div className="bg-card rounded-lg overflow-hidden w-full max-w-md">
                <div className="relative">
                  <div className="aspect-[9/16] md:aspect-auto md:max-h-[80vh] bg-black">
                    <video ref={videoRef} className="w-full h-full object-contain" playsInline autoPlay muted />
                  </div>

                  <button
                    onClick={closeCamera}
                    className="absolute top-3 left-3 bg-background/80 text-sm px-3 py-1 rounded-md shadow"
                  >
                    Close
                  </button>

                  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-4">
                    {/* left: thumbnail preview if available */}
                    <div className="relative">
                      {latestPreview ? (
                        <Image src={latestPreview} alt="preview" width={48} height={64} className="w-12 h-16 object-cover rounded" />
                      ) : (
                        <div className="w-12 h-16 bg-black/40 rounded border border-border" />
                      )}
                      {sessionImages.length > 1 && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="bg-black/60 text-white text-xs font-semibold px-2 py-0.5 rounded">
                            {sessionImages.length}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* capture button: white circle with red inner dot */}
                    <button
                      onClick={captureFromCamera}
                      className="bg-white rounded-full w-16 h-16 flex items-center justify-center shadow-lg border"
                      aria-label="Capture"
                    >
                      <span className="w-3.5 h-3.5 bg-red-600 rounded-full shadow-inner" />
                    </button>

                    {/* right: small check indicator when at least one session image captured; clicking commits them */}
                    <div className="w-8 h-8 flex items-center justify-center">
                      {sessionImages.length > 0 ? (
                        <button
                          onClick={() => {
                              // commit session images into main images list
                              setImages((prev) => [...prev, ...sessionImages]);
                              setSessionImages([]);
                              if (latestPreview) {
                                try {
                                  URL.revokeObjectURL(latestPreview);
                                } catch {}
                                setLatestPreview(null);
                              }
                              // close the camera modal after committing
                              closeCamera();
                            }}
                          className="w-6 h-6 bg-emerald-600 text-white rounded-full flex items-center justify-center"
                          aria-label="Add photos"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      ) : (
                        <div className="w-6 h-6 bg-transparent rounded-full border border-border" />
                      )}
                    </div>
                  </div>

                  <div className="absolute left-1/2 -translate-x-1/2 bottom-[-2.25rem]">
                    <div className="text-xs text-muted-foreground">Tip: Take multiple photos if needed to ensure legible text.</div>
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
                            const target = copy[i];
                            if (target) {
                              target.include = e.target.checked;
                              setMatchedItems(copy);
                            }
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
                            const target = copy[i];
                            if (target) {
                              target.quantity_delta = Number(e.target.value);
                              setMatchedItems(copy);
                            }
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
                <div className="mt-2 grid gap-3 w-full max-w-full overflow-hidden">
                  {newItems.map((item, i) => (
                    <div key={i} className="p-3 border rounded-md bg-background w-full min-w-0 box-border overflow-hidden">
                      <div className="flex items-center gap-3 w-full min-w-0">
                        <input
                          type="checkbox"
                          checked={item.include}
                          onChange={(e) => {
                            const copy = [...newItems];
                            const target = copy[i];
                            if (target) {
                              target.include = e.target.checked;
                              setNewItems(copy);
                            }
                          }}
                        />
                        <Input
                          value={item.name}
                          onChange={(e) => {
                            const copy = [...newItems];
                            const target = copy[i];
                            if (target) {
                              target.name = e.target.value;
                              setNewItems(copy);
                            }
                          }}
                          className="flex-1 min-w-0 w-full"
                        />
                        {item.confidence !== "high" && <div className="text-orange-500 text-xs shrink-0">{item.confidence}</div>}
                      </div>

                      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="text-xs text-muted-foreground">Qty</label>
                          <Input
                            type="number"
                            value={String(item.quantity)}
                            onChange={(e) => {
                              const copy = [...newItems];
                              const target = copy[i];
                              if (target) {
                                target.quantity = Number(e.target.value);
                                setNewItems(copy);
                              }
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
                              const target = copy[i];
                              if (target) {
                                target.expirationDate = e.target.value;
                                setNewItems(copy);
                              }
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
                            const target = copy[i];
                            if (target) {
                              target.placement = e.target.value;
                              setNewItems(copy);
                            }
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
                            const target = copy[i];
                            if (target) {
                              target.keywords = e.target.value;
                              setNewItems(copy);
                            }
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
                              const target = copy[i];
                              if (target) {
                                target.imageUrl = url;
                                setNewItems(copy);
                              }
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
          {scanned && (matchedItems.some((m) => m.include) || newItems.some((n) => n.include)) && (
            <Button
              onClick={handleConfirm}
              disabled={confirming || newItemsMissingRequiredFields}
              variant="default"
              style={{ backgroundColor: "#528f04", borderColor: "#528f04" }}
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
          )}
        </CardFooter>
      </Card>
    </div>
  );
}