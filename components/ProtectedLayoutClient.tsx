"use client";

import { useState } from "react";
import { Layout, Menu } from "antd";
import {
  FileTextOutlined,
  UserOutlined,
  LogoutOutlined,
  TeamOutlined,
} from "@ant-design/icons";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

const { Header, Content, Footer, Sider } = Layout;

interface ProtectedLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  isAdmin: boolean;
}

export default function ProtectedLayoutClient({
  children,
  userName,
  isAdmin,
}: ProtectedLayoutClientProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = async () => {
    await signOut({ redirect: false });
    router.push("/login");
  };

  // Get selected key based on current path
  const getSelectedKey = () => {
    if (pathname?.startsWith("/admin/users")) return "users";
    if (pathname?.startsWith("/transport-documents")) return "documents";
    return "documents";
  };

  const menuItems = [
    {
      key: "documents",
      icon: <FileTextOutlined />,
      label: <Link href="/transport-documents">เอกสารขนส่ง</Link>,
    },
    ...(isAdmin
      ? [
          {
            key: "users",
            icon: <TeamOutlined />,
            label: <Link href="/admin/users">จัดการผู้ใช้</Link>,
          },
        ]
      : []),
  ];

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        collapsible
        collapsed={collapsed}
        onCollapse={(value) => setCollapsed(value)}
        style={{
          overflow: "auto",
          height: "100vh",
          position: "fixed",
          left: 0,
          top: 0,
          bottom: 0,
        }}
      >
        <div
          style={{
            height: 32,
            margin: 16,
            background: "rgba(255, 255, 255, 0.2)",
            borderRadius: 6,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "white",
            fontWeight: "bold",
            fontSize: collapsed ? 14 : 16,
          }}
        >
          {collapsed ? "SYL" : "SYL System"}
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[getSelectedKey()]}
          items={menuItems}
        />
      </Sider>
      <Layout
        style={{
          marginLeft: collapsed ? 80 : 200,
          transition: "margin-left 0.2s",
        }}
      >
        <Header
          style={{
            padding: "0 24px",
            background: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 1px 4px rgba(0,21,41,.08)",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 500 }}>
            ระบบจัดการเอกสารขนส่ง
          </div>
          <Menu
            mode="horizontal"
            selectedKeys={[]}
            style={{ border: "none", flex: 0 }}
            items={[
              {
                key: "user",
                icon: <UserOutlined />,
                label: userName,
                children: [
                  {
                    key: "logout",
                    icon: <LogoutOutlined />,
                    label: "ออกจากระบบ",
                    onClick: handleLogout,
                  },
                ],
              },
            ]}
          />
        </Header>
        <Content style={{ margin: "24px 16px 0", overflow: "initial" }}>
          <div style={{ padding: 24, background: "#fff", minHeight: 360 }}>
            {children}
          </div>
        </Content>
        <Footer style={{ textAlign: "center" }}>
          SYL System ©{new Date().getFullYear()}
        </Footer>
      </Layout>
    </Layout>
  );
}
