# 记事本

应用内的名字是“小页”，这是一个手机优先的离线记事本。数据保存在当前设备的应用存储里，不上传服务器。

安卓安装包：[xiaoye-notepad.apk](./xiaoye-notepad.apk)

## 功能

- 新建、编辑、删除和撤销删除
- 正文自动保存
- 搜索标题和正文
- 置顶笔记
- 五种纸张颜色
- Markdown 分享或导出
- 全部笔记 JSON 备份
- PWA 离线缓存
- Android WebView APK

## 界面预览

![手机首页](./previews/mobile-home.png)

![编辑页](./previews/mobile-editor.png)

## 直接使用网页版

在 `xiaoye-app` 目录启动任意静态文件服务器，例如：

```powershell
python -m http.server 4173
```

然后打开 `http://127.0.0.1:4173/`。手机和电脑在同一局域网时，也可以用电脑的局域网地址访问。

在 Chrome、Edge 或 Safari 中打开后，可以选择“安装应用”或“添加到主屏幕”。安装后可以像普通 App 一样从主屏幕启动。

## Android APK

`xiaoye-notepad.apk` 是可直接安装的调试签名 APK，支持 Android 6.0 及以上。

APK 采用本地 WebView，不请求网络权限。笔记保存在 WebView 的本地存储中，卸载应用或清除应用数据会删除笔记，建议定期使用“备份全部笔记”。

## 注意

- 这是本地单机记事本，没有账号同步。
- 浏览器版和 APK 的数据彼此独立。
- 清除浏览器站点数据或 Android 应用数据会删除笔记。

## 开源许可

本项目使用 [MIT License](./LICENSE)，允许复制、修改、分发和商业使用。保留版权与许可声明即可。
