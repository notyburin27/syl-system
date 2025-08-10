import React from "react";
import { Menu } from "antd";
import { FileTextOutlined } from "@ant-design/icons";
import { useNavigate, useLocation } from "react-router-dom";

const SideMenu = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: "/transport-documents",
      icon: <FileTextOutlined />,
      label: "Transport Documents",
    },
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  return (
    <div>
      <div className="logo">SYL</div>
      <Menu
        theme="dark"
        mode="inline"
        selectedKeys={[location.pathname]}
        items={menuItems}
        onClick={handleMenuClick}
      />
    </div>
  );
};

export default SideMenu;
