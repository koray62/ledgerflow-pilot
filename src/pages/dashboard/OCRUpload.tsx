import { useState, useRef, useCallback, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Upload, FileText, CheckCircle, Clock, AlertCircle, XCircle, Eye, Loader2, BookOpen, Camera, X, Pencil } from "lucide-react";
import { useTenant } from "@/hooks/useTenant";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { formatCurrency } from "@/lib/utils";

const statusConfig: Record<string, { icon: typeof CheckCircle; colorClass: string; label: string }> = {
  uploaded: { icon: Clock, colorClass: "text-muted-foreground", label: "Queued" },
  processing: { icon: Loader2, colorClass: "text-info", label: "Processing" },
  completed: { icon: CheckCircle, colorClass: "text-success", label: "Completed" },
  review_required: { icon: AlertCircle, colorClass: "text-warning", label: "Review Required" },
  failed: { icon: XCircle, colorClass: "text-destructive", label: "Failed" },
};

const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX_SIZE = 10 * 1024 * 1024; // 10MB

interface OCRUploadProps {
  onEditEntry?: (entryId: string) => void;
}

const OCRUpload = ({ onEditEntry }: OCRUploadProps) => {
  const { tenantId, defaultCurrency } = useTenant();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [uploading, setUploading] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [creatingJE, setCreatingJE] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  // Clean up camera stream when modal closes
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
  }, []);

  const openCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      streamRef.current = stream;
      setCameraOpen(true);
      // Attach stream after dialog renders
      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      });
    } catch (err: any) {
      if (err.name === "NotAllowedError") {
        toast({ title: "Camera access denied", description: "Please allow camera access in your browser settings.", variant: "destructive" });
      } else {
        toast({ title: "Camera unavailable", description: "Could not access camera. Try uploading a file instead.", variant: "destructive" });
      }
    }
  }, []);

  const capturePhoto = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) return;
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: "image/jpeg" });
      stopCamera();
      setCameraOpen(false);
      uploadAndProcess(file);
    }, "image/jpeg", 0.9);
  }, [stopCamera]);

  useEffect(() => {
    if (!cameraOpen) stopCamera();
  }, [cameraOpen, stopCamera]);

  // Fetch documents
  const { data: documents = [], isLoading } = useQuery({
    queryKey: ["documents", tenantId],
    enabled: !!tenantId,
    refetchInterval: processingIds.size > 0 ? 3000 : false,
    queryFn: async () => {
      const { data } = await supabase
        .from("documents")
        .select("id, filename, status, ocr_confidence, suggested_vendor, suggested_amount, created_at, file_size, processing_time_ms, mime_type, extracted_data, error_message, journal_entry_id, suggested_account_id")
        .eq("tenant_id", tenantId!)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);

      // Clear processing IDs that are done
      if (data) {
        const stillProcessing = new Set<string>();
        data.forEach((d) => {
          if ((d.status === "processing" || d.status === "uploaded") && processingIds.has(d.id)) {
            stillProcessing.add(d.id);
          }
        });
        if (stillProcessing.size !== processingIds.size) {
          setProcessingIds(stillProcessing);
        }
      }

      return data ?? [];
    },
  });

  // Usage count this month
  const docsThisMonth = documents.filter((d) => {
    const created = new Date(d.created_at);
    const now = new Date();
    return created.getMonth() === now.getMonth() && created.getFullYear() === now.getFullYear();
  }).length;

  const uploadAndProcess = useCallback(async (file: File) => {
    if (!tenantId || !user) return;

    if (!ACCEPTED_TYPES.includes(file.type)) {
      toast({ title: "Invalid file type", description: "Please upload PDF, JPG, or PNG files.", variant: "destructive" });
      return;
    }
    if (file.size > MAX_SIZE) {
      toast({ title: "File too large", description: "Maximum file size is 10MB.", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      // Upload to storage
      const storagePath = `${tenantId}/${Date.now()}_${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("tenant-documents")
        .upload(storagePath, file, { contentType: file.type });

      if (uploadErr) throw uploadErr;

      // Create document record
      const { data: doc, error: insertErr } = await supabase
        .from("documents")
        .insert({
          tenant_id: tenantId,
          filename: file.name,
          storage_path: storagePath,
          mime_type: file.type,
          file_size: file.size,
          uploaded_by: user.id,
          status: "uploaded",
        })
        .select("id")
        .single();

      if (insertErr || !doc) throw insertErr || new Error("Failed to create document record");

      setProcessingIds((prev) => new Set(prev).add(doc.id));
      queryClient.invalidateQueries({ queryKey: ["documents", tenantId] });

      // Trigger OCR processing
      const { error: fnErr } = await supabase.functions.invoke("process-document", {
        body: { documentId: doc.id },
      });

      if (fnErr) {
        console.error("Process function error:", fnErr);
        toast({ title: "Processing queued", description: "Document uploaded. Processing may take a moment." });
      }

      queryClient.invalidateQueries({ queryKey: ["documents", tenantId] });
    } catch (err: any) {
      console.error("Upload error:", err);
      toast({ title: "Upload failed", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  }, [tenantId, user, queryClient]);

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach((f) => uploadAndProcess(f));
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    handleFiles(e.dataTransfer.files);
  };

  const createJournalEntry = useCallback(async (doc: any) => {
    if (!tenantId || !user) return;
    const extracted = doc.extracted_data as any;
    if (!extracted?.total_amount) {
      toast({ title: "Missing data", description: "No total amount found in extracted data.", variant: "destructive" });
      return;
    }

    setCreatingJE(doc.id);
    try {
      // Find Accounts Payable account (liability) for credit side
      const { data: apAccounts } = await supabase
        .from("chart_of_accounts")
        .select("id, code, name")
        .eq("tenant_id", tenantId)
        .eq("account_type", "liability")
        .is("deleted_at", null)
        .eq("is_active", true)
        .limit(10);

      const apAccount = apAccounts?.find((a) => a.name.toLowerCase().includes("payable")) || apAccounts?.[0];
      if (!apAccount) {
        toast({ title: "No liability account", description: "Please create an Accounts Payable account first.", variant: "destructive" });
        return;
      }

      // Use suggested account for debit, or fall back to first expense account
      let debitAccountId = doc.suggested_account_id;
      if (!debitAccountId) {
        const { data: expAccounts } = await supabase
          .from("chart_of_accounts")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("account_type", "expense")
          .is("deleted_at", null)
          .eq("is_active", true)
          .limit(1)
          .single();
        debitAccountId = expAccounts?.id;
      }
      if (!debitAccountId) {
        toast({ title: "No expense account", description: "Please create an expense account first.", variant: "destructive" });
        return;
      }

      const entryNumber = `OCR-${Date.now().toString(36).toUpperCase()}`;
      const totalAmount = Number(extracted.total_amount);

      // Create journal entry
      const { data: je, error: jeErr } = await supabase
        .from("journal_entries")
        .insert({
          tenant_id: tenantId,
          entry_number: entryNumber,
          entry_date: extracted.document_date || new Date().toISOString().split("T")[0],
          description: `${extracted.vendor_name || "Unknown vendor"} – ${extracted.document_number || doc.filename}`,
          status: "draft",
          created_by: user.id,
          memo: `Auto-created from OCR scan of ${doc.filename}`,
        })
        .select("id")
        .single();

      if (jeErr || !je) throw jeErr || new Error("Failed to create journal entry");

      // Create balanced journal lines (debit expense, credit AP)
      const { error: linesErr } = await supabase
        .from("journal_lines")
        .insert([
          {
            tenant_id: tenantId,
            journal_entry_id: je.id,
            account_id: debitAccountId,
            debit: totalAmount,
            credit: 0,
            description: extracted.vendor_name ? `${extracted.vendor_name} expense` : "Document expense",
          },
          {
            tenant_id: tenantId,
            journal_entry_id: je.id,
            account_id: apAccount.id,
            debit: 0,
            credit: totalAmount,
            description: extracted.vendor_name ? `Payable to ${extracted.vendor_name}` : "Accounts payable",
          },
        ]);

      if (linesErr) throw linesErr;

      // Link document to journal entry
      await supabase
        .from("documents")
        .update({ journal_entry_id: je.id })
        .eq("id", doc.id);

      queryClient.invalidateQueries({ queryKey: ["documents", tenantId] });
      queryClient.invalidateQueries({ queryKey: ["journal-entries", tenantId] });

      toast({ title: "Journal entry created", description: `Entry ${entryNumber} created as draft with balanced debit/credit of ${fmt(totalAmount)}.` });
    } catch (err: any) {
      console.error("Create JE error:", err);
      toast({ title: "Failed to create entry", description: err.message || "Something went wrong.", variant: "destructive" });
    } finally {
      setCreatingJE(null);
    }
  }, [tenantId, user, queryClient]);

  const fmt = (n: number) => formatCurrency(n, defaultCurrency);

  const fmtSize = (bytes: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div>
      {/* Camera modal */}
      <Dialog open={cameraOpen} onOpenChange={(open) => { if (!open) { stopCamera(); setCameraOpen(false); } }}>
        <DialogContent className="sm:max-w-lg p-0 overflow-hidden">
          <div className="relative bg-black">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-[4/3] object-cover"
            />
            <div className="absolute bottom-4 left-0 right-0 flex items-center justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full bg-background/80 backdrop-blur-sm"
                onClick={() => { stopCamera(); setCameraOpen(false); }}
              >
                <X className="h-5 w-5" />
              </Button>
              <Button
                size="icon"
                className="h-14 w-14 rounded-full bg-white hover:bg-white/90 text-black shadow-lg"
                onClick={capturePhoto}
              >
                <Camera className="h-6 w-6" />
              </Button>
              <div className="h-10 w-10" /> {/* spacer for centering */}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload area */}
      <Card className="mb-6">
        <CardContent className="p-8">
          <div
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-12 transition-colors cursor-pointer ${
              dragOver ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent/10">
              {uploading ? (
                <Loader2 className="h-6 w-6 text-accent animate-spin" />
              ) : (
                <Upload className="h-6 w-6 text-accent" />
              )}
            </div>
            <p className="text-sm font-medium text-foreground">
              {uploading ? "Uploading..." : "Drop files here or click to upload"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">PDF, JPG, PNG up to 10MB</p>
            <div className="mt-4 flex items-center gap-2">
              <Button variant="outline" size="sm" disabled={uploading}>
                Select Files
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={uploading}
                className="gap-1.5"
                onClick={(e) => {
                  e.stopPropagation();
                  openCamera();
                }}
              >
                <Camera className="h-4 w-4" />
                Scan
              </Button>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>{docsThisMonth} scans this month</span>
            <span>AI-Powered Extraction</span>
          </div>
        </CardContent>
      </Card>

      {/* Recent scans */}
      <Card>
        <CardContent className="p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">Recent Scans</h3>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : documents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No documents yet. Upload your first invoice or receipt above.
            </p>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => {
                const cfg = statusConfig[doc.status] || statusConfig.uploaded;
                const StatusIcon = cfg.icon;
                const isExpanded = expandedId === doc.id;
                const extracted = doc.extracted_data as any;

                return (
                  <div key={doc.id}>
                    <div
                      className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-foreground">{doc.filename}</p>
                          <p className="text-xs text-muted-foreground">
                            {doc.suggested_vendor || "—"} · {new Date(doc.created_at).toLocaleDateString()} · {fmtSize(doc.file_size)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {doc.suggested_amount != null && (
                          <span className="font-mono text-sm text-foreground">{fmt(doc.suggested_amount)}</span>
                        )}
                        {doc.ocr_confidence != null && (
                          <span className="font-mono text-xs text-muted-foreground">{doc.ocr_confidence}%</span>
                        )}
                        <div className={`flex items-center gap-1 ${cfg.colorClass}`}>
                          <StatusIcon className={`h-4 w-4 ${doc.status === "processing" ? "animate-spin" : ""}`} />
                          <span className="text-xs whitespace-nowrap">{cfg.label}</span>
                        </div>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && extracted && (
                      <div className="ml-8 mt-2 mb-1 rounded-lg border border-border bg-muted/30 p-4 text-sm space-y-3">
                        {doc.ocr_confidence != null && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Confidence Score</p>
                            <div className="flex items-center gap-3">
                              <Progress value={doc.ocr_confidence} className="h-2 flex-1" />
                              <span className={`font-mono text-xs font-medium ${
                                doc.ocr_confidence >= 85 ? "text-success" : doc.ocr_confidence >= 60 ? "text-warning" : "text-destructive"
                              }`}>
                                {doc.ocr_confidence}%
                              </span>
                            </div>
                          </div>
                        )}

                        <div className="grid grid-cols-2 gap-3 text-xs">
                          {extracted.vendor_name && (
                            <div><span className="text-muted-foreground">Vendor:</span> <span className="font-medium text-foreground">{extracted.vendor_name}</span></div>
                          )}
                          {extracted.document_number && (
                            <div><span className="text-muted-foreground">Doc #:</span> <span className="font-mono text-foreground">{extracted.document_number}</span></div>
                          )}
                          {extracted.document_date && (
                            <div><span className="text-muted-foreground">Date:</span> <span className="font-mono text-foreground">{extracted.document_date}</span></div>
                          )}
                          {extracted.due_date && (
                            <div><span className="text-muted-foreground">Due:</span> <span className="font-mono text-foreground">{extracted.due_date}</span></div>
                          )}
                          {extracted.subtotal != null && (
                            <div><span className="text-muted-foreground">Subtotal:</span> <span className="font-mono text-foreground">{fmt(extracted.subtotal)}</span></div>
                          )}
                          {extracted.tax_amount != null && (
                            <div><span className="text-muted-foreground">Tax:</span> <span className="font-mono text-foreground">{fmt(extracted.tax_amount)}</span></div>
                          )}
                          {extracted.total_amount != null && (
                            <div><span className="text-muted-foreground">Total:</span> <span className="font-mono font-medium text-foreground">{fmt(extracted.total_amount)}</span></div>
                          )}
                          {extracted.suggested_account_name && (
                            <div><span className="text-muted-foreground">Suggested Account:</span> <span className="font-medium text-accent">{extracted.suggested_account_code} – {extracted.suggested_account_name}</span></div>
                          )}
                        </div>

                        {extracted.line_items?.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Line Items</p>
                            <div className="rounded border border-border overflow-hidden">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-border bg-muted/50">
                                    <th className="px-2 py-1.5 text-left text-muted-foreground font-medium">Description</th>
                                    <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Qty</th>
                                    <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Price</th>
                                    <th className="px-2 py-1.5 text-right text-muted-foreground font-medium">Amount</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {extracted.line_items.map((item: any, idx: number) => (
                                    <tr key={idx} className="border-b border-border/50">
                                      <td className="px-2 py-1.5 text-foreground">{item.description}</td>
                                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{item.quantity ?? "—"}</td>
                                      <td className="px-2 py-1.5 text-right font-mono text-muted-foreground">{item.unit_price != null ? fmt(item.unit_price) : "—"}</td>
                                      <td className="px-2 py-1.5 text-right font-mono text-foreground">{fmt(item.amount)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {/* Create Journal Entry button */}
                        {(doc.status === "completed" || doc.status === "review_required") && !doc.journal_entry_id && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-2 text-accent border-accent/30 hover:bg-accent/10"
                            disabled={creatingJE === doc.id}
                            onClick={(e) => { e.stopPropagation(); createJournalEntry(doc); }}
                          >
                            {creatingJE === doc.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <BookOpen className="h-3.5 w-3.5" />
                            )}
                            Create Journal Entry
                          </Button>
                        )}

                        {doc.journal_entry_id && (
                          <div className="flex items-center gap-2">
                            <p className="text-xs text-success flex items-center gap-1">
                              <CheckCircle className="h-3.5 w-3.5" />
                              Journal entry created
                            </p>
                            {onEditEntry && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="gap-1.5 text-xs h-7"
                                onClick={(e) => { e.stopPropagation(); onEditEntry(doc.journal_entry_id!); }}
                              >
                                <Pencil className="h-3 w-3" />
                                Edit Entry
                              </Button>
                            )}
                          </div>
                        )}

                        {doc.processing_time_ms && (
                          <p className="text-xs text-muted-foreground">Processed in {(doc.processing_time_ms / 1000).toFixed(1)}s</p>
                        )}

                        {doc.error_message && (
                          <p className="text-xs text-destructive">{doc.error_message}</p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OCRUpload;
