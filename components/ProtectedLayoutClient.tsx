"use client";

import { useState } from "react";
import { Layout, Menu, Dropdown, Space, Tag } from "antd";
import {
  FileTextOutlined,
  UserOutlined,
  LogoutOutlined,
  TeamOutlined,
  BankOutlined,
  ShoppingOutlined,
  TruckOutlined,
  DownOutlined,
  PictureOutlined,
} from "@ant-design/icons";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";

const { Header, Content, Footer, Sider } = Layout;

interface ProtectedLayoutClientProps {
  children: React.ReactNode;
  userName: string;
  isAdmin: boolean;
  userRole: string;
}

export default function ProtectedLayoutClient({
  children,
  userName,
  isAdmin,
  userRole,
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
    if (pathname?.startsWith("/statement-converter"))
      return "statement-converter";
    if (pathname?.startsWith("/stock/products")) return "stock-products";
    if (pathname?.startsWith("/stock/import")) return "stock-import";
    if (pathname?.startsWith("/stock/export")) return "stock-export";
    if (pathname?.startsWith("/stock/buyers")) return "stock-buyers";
    if (pathname === "/stock") return "stock-dashboard";
    if (pathname?.startsWith("/jobs/settings/fuel-price")) return "jobs-fuel-price";
    if (pathname?.startsWith("/jobs/settings/rates/transfer")) return "jobs-rates-transfer";
    if (pathname?.startsWith("/jobs/settings/rates/income")) return "jobs-rates-income";
    if (pathname?.startsWith("/jobs/settings/rates/driver-wage")) return "jobs-rates-driver-wage";
    if (pathname?.startsWith("/jobs/settings/customers")) return "jobs-customers";
    if (pathname?.startsWith("/jobs/settings/drivers")) return "jobs-drivers";
    if (pathname?.startsWith("/jobs/settings/locations")) return "jobs-locations";
    if (pathname?.startsWith("/jobs")) return "jobs-list";
    if (pathname?.startsWith("/transport-documents")) return "documents";
    if (pathname?.startsWith("/line-images")) return "line-images";
    return "documents";
  };

  const getOpenKeys = () => {
    const keys: string[] = [];
    if (pathname?.startsWith("/stock")) keys.push("stock");
    if (pathname?.startsWith("/jobs")) keys.push("jobs");
    if (pathname?.startsWith("/jobs/settings/rates")) { keys.push("jobs-settings"); keys.push("jobs-rates"); }
    else if (pathname?.startsWith("/jobs/settings")) { keys.push("jobs-settings"); }
    return keys;
  };

  const jobsMenu = {
    key: "jobs",
    icon: <TruckOutlined />,
    label: "งานขนส่ง",
    children: [
      {
        key: "jobs-list",
        label: <Link href="/jobs">รายการงาน</Link>,
      },
      {
        key: "jobs-settings",
        label: "ตั้งค่าข้อมูล",
        children: [
          {
            key: "jobs-customers",
            label: <Link href="/jobs/settings/customers">ลูกค้า</Link>,
          },
          {
            key: "jobs-drivers",
            label: <Link href="/jobs/settings/drivers">คนขับรถ</Link>,
          },
          {
            key: "jobs-locations",
            label: <Link href="/jobs/settings/locations">สถานที่</Link>,
          },
        ],
      },
      ...(isAdmin ? [
        {
          key: "jobs-rates",
          label: "อัตราค่าบริการ",
          children: [
            { key: "jobs-rates-transfer", label: <Link href="/jobs/settings/rates/transfer">คาดการณ์โอน</Link> },
            { key: "jobs-rates-income", label: <Link href="/jobs/settings/rates/income">รายได้</Link> },
            { key: "jobs-rates-driver-wage", label: <Link href="/jobs/settings/rates/driver-wage">ค่าเที่ยวคนขับ</Link> },
          ],
        },
        {
          key: "jobs-fuel-price",
          label: <Link href="/jobs/settings/fuel-price">ราคาน้ำมัน</Link>,
        },
      ] : []),
    ],
  };

  const menuItems = isAdmin
    ? [
        jobsMenu,
        {
          key: "documents",
          icon: <FileTextOutlined />,
          label: <Link href="/transport-documents">เอกสารขนส่ง</Link>,
        },
        {
          key: "statement-converter",
          icon: <BankOutlined />,
          label: <Link href="/statement-converter">แปลง Statement</Link>,
        },
        {
          key: "stock",
          icon: <ShoppingOutlined />,
          label: "คลังสินค้า",
          children: [
            {
              key: "stock-dashboard",
              label: <Link href="/stock">ภาพรวม</Link>,
            },
            {
              key: "stock-products",
              label: <Link href="/stock/products">สินค้า</Link>,
            },
            {
              key: "stock-import",
              label: <Link href="/stock/import">นำเข้าสินค้า</Link>,
            },
            {
              key: "stock-export",
              label: <Link href="/stock/export">ขายสินค้า</Link>,
            },
            {
              key: "stock-buyers",
              label: <Link href="/stock/buyers">ลูกค้า</Link>,
            },
          ],
        },
        {
          key: "users",
          icon: <TeamOutlined />,
          label: <Link href="/admin/users">จัดการผู้ใช้</Link>,
        },
        {
          key: "line-images",
          icon: <PictureOutlined />,
          label: <Link href="/line-images">รูปภาพ LINE</Link>,
        },
      ]
    : [
        jobsMenu,
        {
          key: "line-images",
          icon: <PictureOutlined />,
          label: <Link href="/line-images">รูปภาพ LINE</Link>,
        },
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
          defaultOpenKeys={getOpenKeys()}
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
          <Dropdown
            menu={{
              items: [
                {
                  key: "logout",
                  icon: <LogoutOutlined />,
                  label: "ออกจากระบบ",
                  onClick: handleLogout,
                },
              ],
            }}
          >
            <Space style={{ cursor: "pointer" }}>
              <UserOutlined />
              {userName}
              <Tag
                color={userRole === "ADMIN" ? "volcano" : "blue"}
                style={{ marginLeft: 2, marginRight: 0 }}
              >
                {userRole}
              </Tag>
              <DownOutlined style={{ fontSize: 10 }} />
            </Space>
          </Dropdown>
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
