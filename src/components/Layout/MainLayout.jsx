import React from "react";
import { Layout } from "antd";
import SideMenu from "../SideMenu/SideMenu";

const { Header, Sider, Content } = Layout;

const MainLayout = ({ children }) => {
  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider width={250} theme="dark">
        <SideMenu />
      </Sider>
      <Layout>
        <Header className="main-header">
          <h1 className="header-title">SYL Transport System</h1>
        </Header>
        <Content style={{ padding: "24px", background: "#f5f5f5" }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout;
