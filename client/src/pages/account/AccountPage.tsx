import { useEffect, useRef, useState } from "react";
import { User, Camera, KeyRound, ShieldCheck, MessageSquareHeart } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  changePassword,
  getMe,
  updateProfile,
  type AccountProfile,
} from "@/api/account";
import { getLicenseStatus } from "@/api/license";

function readImageAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const size = 160;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error("无法处理图片。"));
      }
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片读取失败。"));
    };
    img.src = url;
  });
}

export default function AccountPage() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [nickname, setNickname] = useState("");
  const [email, setEmail] = useState("");
  const [avatar, setAvatar] = useState("");
  const [curPassword, setCurPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [pwdMsg, setPwdMsg] = useState("");
  const [license, setLicense] = useState<{ plan: string; price?: number | null; expired?: boolean } | null>(null);

  const load = async () => {
    try {
      const res = await getMe();
      const d = res.data;
      setProfile(d ?? null);
      setNickname(d?.nickname ?? "");
      setEmail(d?.email ?? "");
      setAvatar(d?.avatar ?? "");
    } catch {
      /* 服务器不可用则留空，用户仍可在本页看到表单 */
    }
    try {
      const lr = await getLicenseStatus();
      if (lr.data) {
        setLicense({ plan: lr.data.plan, price: lr.data.price, expired: lr.data.expired });
      }
    } catch {
      /* 授权服务器未连上则不显示 */
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAvatarChange = async (file?: File) => {
    if (!file) return;
    try {
      const dataUrl = await readImageAsDataUrl(file);
      setAvatar(dataUrl);
      setProfileMsg("头像已选，点击「保存资料」生效。");
    } catch (error) {
      toast.error((error as Error).message);
    }
  };

  const handleSaveProfile = async () => {
    setSavingProfile(true);
    setProfileMsg("");
    try {
      const res = await updateProfile({ nickname, email, avatar });
      setProfile(res.data ?? null);
      setProfileMsg(res.message || "已保存。");
    } catch (error) {
      setProfileMsg((error as Error).message);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async () => {
    if (!newPassword) {
      setPwdMsg("请输入新密码。");
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdMsg("两次输入的新密码不一致。");
      return;
    }
    setSavingPwd(true);
    setPwdMsg("");
    try {
      const res = await changePassword({
        currentPassword: profile?.hasPassword ? curPassword : undefined,
        newPassword,
      });
      setProfile(res.data ?? null);
      setPwdMsg(res.message || "密码已更新。");
      setCurPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (error) {
      setPwdMsg((error as Error).message);
    } finally {
      setSavingPwd(false);
    }
  };

  const planLabel =
    license?.plan === "premium" ? "高级版" : license?.plan === "standard" ? "标准版" : "试用版";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">个人中心</h1>
        <p className="text-sm text-muted-foreground">管理你的资料、密码与授权状态。</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <User className="h-4 w-4" /> 个人资料
          </CardTitle>
          <CardDescription>头像、昵称、联系方式。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <div className="relative">
              {avatar ? (
                <img src={avatar} alt="头像" className="h-20 w-20 rounded-full border object-cover" />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border bg-muted text-muted-foreground">
                  <User className="h-8 w-8" />
                </div>
              )}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow"
                title="更换头像"
              >
                <Camera className="h-4 w-4" />
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => handleAvatarChange(e.target.files?.[0])}
              />
            </div>
            <div className="text-sm text-muted-foreground">
              点击右上角相机图标更换头像。<br />图片会裁剪为正方形并压缩后保存到服务器。
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">昵称</label>
              <Input value={nickname} onChange={(e) => setNickname(e.target.value)} placeholder="你的昵称" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">邮箱 / 联系方式</label>
              <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="用于售后联系（选填）" />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={handleSaveProfile} disabled={savingProfile}>
              保存资料
            </Button>
            {profileMsg ? (
              <span className={cn("text-sm", profileMsg.includes("失败") || profileMsg.includes("不正确") ? "text-destructive" : "text-emerald-600")}>
                {profileMsg}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="h-4 w-4" /> 密码
          </CardTitle>
          <CardDescription>
            {profile?.hasPassword ? "已设置本机密码，修改需输入当前密码。" : "设置一个本机密码，保护你的使用记录。"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {profile?.hasPassword ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">当前密码</label>
              <Input type="password" value={curPassword} onChange={(e) => setCurPassword(e.target.value)} placeholder="输入当前密码" />
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">新密码</label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="至少 6 位" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">确认新密码</label>
              <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="再次输入新密码" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button onClick={handleChangePassword} disabled={savingPwd} variant="outline">
              {profile?.hasPassword ? "修改密码" : "设置密码"}
            </Button>
            {pwdMsg ? (
              <span className={cn("text-sm", pwdMsg.includes("失败") || pwdMsg.includes("不正确") || pwdMsg.includes("不一致") ? "text-destructive" : "text-emerald-600")}>
                {pwdMsg}
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" /> 我的授权
          </CardTitle>
          <CardDescription>当前授权状态，与「设置 → 授权与激活」一致。</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {license ? (
            <div className="flex items-center gap-2 text-sm">
              <Badge variant="outline" className={license.plan === "premium" ? "border-amber-300 bg-amber-50 text-amber-700" : undefined}>
                {planLabel}
              </Badge>
              {license.expired ? (
                <span className="text-destructive">已过期</span>
              ) : (
                <span className="text-muted-foreground">{license.plan === "trial" ? "体验中，尚未激活授权" : `已激活${license.price ? `（¥${license.price}）` : ""}`}</span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">暂时无法读取授权状态（未连接授权服务器）。</p>
          )}
          <Button
            variant="ghost"
            className="mt-1 h-auto p-0 text-sm text-primary"
            onClick={() => navigate("/settings/license")}
          >
            前往授权与激活页 →
          </Button>
        </CardContent>
      </Card>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageSquareHeart className="h-4 w-4" /> 帮助与联系
          </CardTitle>
          <CardDescription>遇到问题或有建议，欢迎给我们留言。</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => navigate("/feedback")}>
            前往客服反馈
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
