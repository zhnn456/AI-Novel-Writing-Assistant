import { Compass } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="items-center">
          <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-xl bg-muted">
            <Compass className="h-7 w-7 text-muted-foreground" />
          </div>
          <CardTitle className="text-2xl">页面不存在</CardTitle>
          <CardDescription>
            你访问的地址没有对应页面，可能已被移动或删除。
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => navigate(-1)}>
            返回上一页
          </Button>
          <Button onClick={() => navigate("/")}>
            回到首页
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
