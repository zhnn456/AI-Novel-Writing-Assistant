import { useEffect, useState } from "react";
import { MessageSquareHeart, QrCode, Send, History } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { getMyFeedback, submitFeedback, type FeedbackMessage, type FeedbackType } from "@/api/feedback";
import wechatQr from "@/assets/wechat-contact.jpg";
import { cn } from "@/lib/utils";

const TYPE_LABEL: Record<FeedbackType, string> = {
  suggestion: "建议",
  bug: "反馈问题",
  feedback: "意见",
};

export default function FeedbackPage() {
  const [type, setType] = useState<FeedbackType>("suggestion");
  const [content, setContent] = useState("");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [notice, setNotice] = useState("");

  const load = async () => {
    try {
      const res = await getMyFeedback();
      setMessages(res.data ?? []);
    } catch {
      setMessages([]);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async () => {
    if (!content.trim()) {
      setNotice("请填写留言内容。");
      return;
    }
    setSubmitting(true);
    setNotice("");
    try {
      const res = await submitFeedback({ type, content: content.trim(), contact: contact.trim() || undefined });
      setNotice(res.message || "已发送。");
      setContent("");
      setContact("");
      await load();
    } catch (error) {
      setNotice((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">客服反馈</h1>
        <p className="text-sm text-muted-foreground">建议、反馈、意见都可以告诉我们；也可扫码联系开发者。</p>
      </header>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="h-4 w-4" /> 扫码联系开发者
            </CardTitle>
            <CardDescription>反馈沟通、获取授权、售后支持，扫码添加好友。</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-3">
            <img
              src={wechatQr}
              alt="开发者微信二维码"
              className="h-56 w-56 rounded-lg border object-contain"
            />
            <p className="text-sm text-muted-foreground">扫二维码，添加我为朋友。</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Send className="h-4 w-4" /> 给我们留言
            </CardTitle>
            <CardDescription>选择类型并填写内容，我们会尽快处理并在下方回复。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Select value={type} onValueChange={(v) => setType(v as FeedbackType)}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="suggestion">建议</SelectItem>
                <SelectItem value="bug">反馈问题</SelectItem>
                <SelectItem value="feedback">意见</SelectItem>
              </SelectContent>
            </Select>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="请描述你的建议 / 遇到的问题 / 想法…"
              rows={5}
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="联系方式（邮箱 / 微信号，选填）"
            />
            <Button onClick={handleSubmit} disabled={submitting} className="w-full">
              发送留言
            </Button>
            {notice ? (
              <p className={cn("text-sm", notice.startsWith("已") || notice.startsWith("成功") ? "text-emerald-600" : "text-destructive")}>
                {notice}
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <History className="h-4 w-4" /> 我的留言
          </CardTitle>
          <CardDescription>这里能看到你发过的留言和开发者的回复。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">还没有留言记录。</p>
          ) : (
            messages.map((m) => (
              <div key={m.id} className="rounded-lg border bg-muted/20 p-3">
                <div className="mb-1 flex items-center gap-2">
                  <Badge variant="outline">{TYPE_LABEL[m.type]}</Badge>
                  <span className="text-xs text-muted-foreground">{new Date(m.createdAt).toLocaleString()}</span>
                  {m.status === "replied" ? (
                    <Badge className="ml-auto bg-emerald-500/10 text-emerald-600">已回复</Badge>
                  ) : (
                    <Badge variant="outline" className="ml-auto">待回复</Badge>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{m.content}</p>
                {m.reply ? (
                  <div className="mt-2 rounded bg-primary/5 p-2">
                    <div className="flex items-center gap-1 text-xs font-medium text-primary">
                      <MessageSquareHeart className="h-3.5 w-3.5" /> 开发者回复
                    </div>
                    <p className="mt-1 text-sm whitespace-pre-wrap">{m.reply}</p>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
