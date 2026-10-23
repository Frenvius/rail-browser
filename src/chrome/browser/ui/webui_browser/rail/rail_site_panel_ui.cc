#include "chrome/browser/ui/webui_browser/rail/rail_site_panel_ui.h"

#include <algorithm>
#include <utility>
#include <vector>

#include "base/functional/bind.h"
#include "base/functional/callback_helpers.h"
#include "base/strings/utf_string_conversions.h"
#include "base/task/bind_post_task.h"
#include "chrome/browser/profiles/profile.h"
#include "chrome/browser/ui/browser.h"
#include "chrome/browser/ui/browser_window/public/browser_window_interface.h"
#include "chrome/browser/ui/chrome_pages.h"
#include "chrome/browser/ui/extensions/extensions_container.h"
#include "chrome/browser/ui/page_info/chrome_page_info_delegate.h"
#include "chrome/browser/ui/page_info/chrome_page_info_ui_delegate.h"
#include "chrome/browser/ui/tabs/tab_strip_model.h"
#include "chrome/browser/ui/toolbar/toolbar_action_view_model.h"
#include "chrome/browser/ui/toolbar/toolbar_actions_model.h"
#include "chrome/browser/ui/views/page_info/page_info_bubble_specification.h"
#include "chrome/browser/ui/views/page_info/page_info_bubble_view.h"
#include "chrome/browser/ui/webui/util/image_util.h"
#include "chrome/browser/ui/webui/webui_embedding_context.h"
#include "chrome/browser/ui/webui/webui_toolbar/webui_toolbar_extensions_container.h"
#include "chrome/browser/ui/webui_browser/rail/rail_accelerators.h"
#include "chrome/browser/ui/webui_browser/webui_browser_ui.h"
#include "chrome/browser/ui/webui_browser/webui_browser_window.h"
#include "chrome/grit/webui_browser_resources.h"
#include "chrome/grit/webui_browser_resources_map.h"
#include "components/content_settings/core/browser/website_settings_info.h"
#include "components/content_settings/core/browser/website_settings_registry.h"
#include "components/page_info/page_info.h"
#include "components/viz/common/frame_sinks/copy_output_result.h"
#include "content/public/browser/render_widget_host_view.h"
#include "content/public/browser/web_contents.h"
#include "content/public/browser/web_ui.h"
#include "content/public/browser/web_ui_data_source.h"
#include "content/public/common/url_constants.h"
#include "third_party/skia/include/core/SkBitmap.h"
#include "ui/base/clipboard/scoped_clipboard_writer.h"
#include "ui/base/models/image_model.h"
#include "ui/base/models/image_model_utils.h"
#include "ui/base/mojom/menu_source_type.mojom.h"
#include "ui/views/widget/widget.h"
#include "ui/webui/webui_util.h"
#include "url/gurl.h"

#if BUILDFLAG(IS_WIN)
#include <windows.applicationmodel.datatransfer.h>
#include <windows.foundation.h>
#include <wrl/client.h>

#include "base/strings/string_util_win.h"
#include "base/win/core_winrt_util.h"
#include "base/win/scoped_hstring.h"
#include "chrome/browser/webshare/win/show_share_ui_for_window_operation.h"
#include "ui/views/win/hwnd_util.h"
#endif

namespace rail {

namespace {

constexpr int kExtensionIconSize = 20;

WebUIBrowserWindow* WindowFor(content::WebUI* web_ui) {
  BrowserWindowInterface* browser =
      webui::GetBrowserWindowInterface(web_ui->GetWebContents());
  return browser ? WebUIBrowserWindow::FromBrowser(browser) : nullptr;
}

std::string PermissionKey(ContentSettingsType type) {
  const content_settings::WebsiteSettingsInfo* info =
      content_settings::WebsiteSettingsRegistry::GetInstance()->Get(type);
  return info ? info->name() : std::string();
}

#if BUILDFLAG(IS_WIN)
void PutShareData(
    const std::u16string& title,
    const GURL& url,
    ABI::Windows::ApplicationModel::DataTransfer::IDataRequestedEventArgs*
        event_args) {
  using ABI::Windows::ApplicationModel::DataTransfer::IDataPackage;
  using ABI::Windows::ApplicationModel::DataTransfer::IDataPackage2;
  using ABI::Windows::ApplicationModel::DataTransfer::IDataPackagePropertySet;
  using ABI::Windows::ApplicationModel::DataTransfer::IDataRequest;
  using ABI::Windows::Foundation::IUriRuntimeClass;
  using ABI::Windows::Foundation::IUriRuntimeClassFactory;
  using Microsoft::WRL::ComPtr;

  if (!event_args) {
    return;
  }
  ComPtr<IDataRequest> request;
  ComPtr<IDataPackage> package;
  ComPtr<IDataPackagePropertySet> properties;
  if (FAILED(event_args->get_Request(&request)) ||
      FAILED(request->get_Data(&package)) ||
      FAILED(package->get_Properties(&properties))) {
    return;
  }
  const std::wstring title_text =
      title.empty() ? std::wstring(L" ") : base::AsWString(title);
  base::win::ScopedHString title_h =
      base::win::ScopedHString::Create(title_text);
  if (FAILED(properties->put_Title(title_h.get()))) {
    return;
  }

  ComPtr<IUriRuntimeClassFactory> uri_factory;
  const HRESULT factory_result =
      base::win::GetActivationFactory<IUriRuntimeClassFactory,
                                      RuntimeClass_Windows_Foundation_Uri>(
          &uri_factory);
  if (FAILED(factory_result)) {
    return;
  }
  base::win::ScopedHString url_h = base::win::ScopedHString::Create(url.spec());
  ComPtr<IUriRuntimeClass> uri;
  ComPtr<IDataPackage2> package2;
  if (FAILED(uri_factory->CreateUri(url_h.get(), &uri)) ||
      FAILED(package.As(&package2))) {
    return;
  }
  package2->SetWebLink(uri.Get());
}
#endif

}

RailSitePanelUIConfig::RailSitePanelUIConfig()
    : DefaultTopChromeWebUIConfig(content::kChromeUIScheme,
                                  kRailSitePanelHost) {}

bool RailSitePanelUIConfig::ShouldAutoResizeHost() {
  return true;
}

RailSitePanelUI::RailSitePanelUI(content::WebUI* web_ui)
    : TopChromeWebUIController(web_ui, false, false) {
  content::WebUIDataSource* source = content::WebUIDataSource::CreateAndAdd(
      web_ui->GetWebContents()->GetBrowserContext(), kRailSitePanelHost);
  webui::SetupWebUIDataSource(source, kWebuiBrowserResources,
                              IDR_WEBUI_BROWSER_RAIL_SITE_PANEL_HTML);
}

RailSitePanelUI::~RailSitePanelUI() {
  Closed();
}

void RailSitePanelUI::BindInterface(
    mojo::PendingReceiver<rail_site_panel::mojom::PageHandlerFactory>
        receiver) {
  page_factory_receiver_.reset();
  page_factory_receiver_.Bind(std::move(receiver));
}

void RailSitePanelUI::CreatePageHandler(
    mojo::PendingRemote<rail_site_panel::mojom::Page> page,
    mojo::PendingReceiver<rail_site_panel::mojom::PageHandler> handler) {
  page_.reset();
  page_.Bind(std::move(page));
  page_handler_receiver_.reset();
  page_handler_receiver_.Bind(std::move(handler));
  Push();
}

WebUIBrowserWindow* RailSitePanelUI::Window() {
  return WindowFor(web_ui());
}

WebUIToolbarExtensionsContainer* RailSitePanelUI::Extensions() {
  WebUIBrowserWindow* window = Window();
  ExtensionsContainer* container =
      window ? ExtensionsContainer::From(*window->browser()) : nullptr;
  return static_cast<WebUIToolbarExtensionsContainer*>(container);
}

content::WebContents* RailSitePanelUI::Target() {
  return target_.get();
}

void RailSitePanelUI::Open(const gfx::Point& anchor,
                           const std::string& space_color) {
  Closed();
  anchor_ = anchor;
  space_color_ = space_color;
  WebUIBrowserWindow* window = Window();
  content::WebContents* contents =
      window ? window->browser()->GetTabStripModel()->GetActiveWebContents()
             : nullptr;
  if (!contents) {
    return;
  }
  target_ = contents->GetWeakPtr();
  open_ = true;
  const GURL url = contents->GetLastCommittedURL();
  ui_delegate_ = std::make_unique<ChromePageInfoUiDelegate>(contents, url);
  page_info_ = std::make_unique<PageInfo>(
      std::make_unique<ChromePageInfoDelegate>(contents), contents, url);
  page_info_->InitializeUiState(this, base::DoNothing());
  Push();
}

void RailSitePanelUI::Closed() {
  open_ = false;
  if (page_info_) {
    page_info_->OnUIClosing(nullptr);
  }
  page_info_.reset();
  ui_delegate_.reset();
  permissions_.clear();
  security_.clear();
  security_summary_.clear();
}

void RailSitePanelUI::SetPermissionInfo(
    const PermissionInfoList& permission_info_list,
    ChosenObjectInfoList chosen_object_info_list) {
  permissions_ = permission_info_list;
  Push();
}

void RailSitePanelUI::SetIdentityInfo(const IdentityInfo& identity_info) {
  std::unique_ptr<SecurityDescription> description =
      GetSecurityDescription(identity_info);
  if (description && description->type == SecurityDescriptionType::INTERNAL) {
    security_ = "internal";
  } else if (description &&
             description->summary_style == SecuritySummaryColor::GREEN) {
    security_ = "secure";
  } else {
    security_ = "insecure";
  }
  security_summary_ =
      description ? base::UTF16ToUTF8(description->summary) : std::string();
  Push();
}

void RailSitePanelUI::Push() {
  if (!open_ || !page_) {
    return;
  }
  rail_site_panel::mojom::SiteStatePtr state = BuildState();
  if (state) {
    page_->Show(std::move(state));
  }
}

rail_site_panel::mojom::SiteStatePtr RailSitePanelUI::BuildState() {
  content::WebContents* contents = Target();
  WebUIBrowserWindow* window = Window();
  if (!contents || !window) {
    return nullptr;
  }

  auto state = rail_site_panel::mojom::SiteState::New();
  const GURL url = contents->GetLastCommittedURL();
  state->host = url.has_host() ? url.GetHost() : url.spec();
  state->space_color = space_color_;
  state->security = security_;
  state->security_summary = security_summary_;
#if BUILDFLAG(IS_WIN)
  state->can_share = url.SchemeIsHTTPOrHTTPS();
#endif

  if (WebUIToolbarExtensionsContainer* container = Extensions()) {
    ToolbarActionsModel* model = ToolbarActionsModel::Get(
        Profile::FromBrowserContext(contents->GetBrowserContext()));
    std::vector<ToolbarActionsModel::ActionId> ids;
    if (model && model->actions_initialized()) {
      ids = model->pinned_action_ids();
      std::vector<ToolbarActionsModel::ActionId> rest;
      for (const auto& id : model->action_ids()) {
        if (!model->IsActionPinned(id)) {
          rest.push_back(id);
        }
      }
      std::ranges::sort(rest, [container](const auto& a, const auto& b) {
        ToolbarActionViewModel* left = container->GetActionForId(a);
        ToolbarActionViewModel* right = container->GetActionForId(b);
        return left && right && left->GetActionName() < right->GetActionName();
      });
      ids.insert(ids.end(), rest.begin(), rest.end());
    }
    const ui::ColorProvider* colors = window->widget()->GetColorProvider();
    const float scale = web_ui()->GetDeviceScaleFactor();
    for (const auto& id : ids) {
      ToolbarActionViewModel* action = container->GetActionForId(id);
      if (!action) {
        continue;
      }
      auto extension = rail_site_panel::mojom::Extension::New();
      extension->id = id;
      extension->name = base::UTF16ToUTF8(action->GetActionName());
      extension->pinned = model->IsActionPinned(id);
      extension->enabled = action->IsEnabled(contents);
      ui::ImageModel icon = action->GetIcon(
          contents, gfx::Size(kExtensionIconSize, kExtensionIconSize));
      if (!extension->enabled) {
        icon = ui::GetDefaultDisabledIconFromImageModel(icon, colors);
      }
      extension->icon =
          GURL(webui::EncodePNGAndMakeDataURI(icon.Rasterize(colors), scale));
      state->extensions.push_back(std::move(extension));
    }
  }

  for (size_t index = 0; index < permissions_.size(); ++index) {
    const PageInfo::PermissionInfo& info = permissions_[index];
    auto permission = rail_site_panel::mojom::Permission::New();
    permission->index = static_cast<int32_t>(index);
    permission->key = PermissionKey(info.type);
    permission->label =
        base::UTF16ToUTF8(PageInfoUI::PermissionTypeToUIString(info.type));
    permission->state = ui_delegate_
                            ? base::UTF16ToUTF8(
                                  PageInfoUI::PermissionMainPageStateToUIString(
                                      ui_delegate_.get(), info))
                            : std::string();
    permission->on = PageInfoUI::IsToggleOn(info);
    permission->toggleable =
        info.source == content_settings::SettingSource::kUser &&
        info.type != ContentSettingsType::CAPTURED_SURFACE_CONTROL;
    state->permissions.push_back(std::move(permission));
  }
  return state;
}

void RailSitePanelUI::Ready(int32_t height) {
  if (ready_callback_) {
    ready_callback_.Run(height);
  }
}

void RailSitePanelUI::RunAction(const std::string& action) {
  WebUIBrowserWindow* window = Window();
  content::WebContents* contents = Target();
  if (action == "page-info") {
    ShowPageInfoBubble();
  }
  Close();
  if (!window) {
    return;
  }
  if (action == "mini-window") {
    if (webui_browser::mojom::Page* page = window->GetWebUIBrowserUI()->page()) {
      page->RunRailCommand(action);
    }
  } else if (action == "copy-link") {
    CopyLink();
  } else if (action == "screenshot") {
    CaptureScreenshot();
  } else if (action == "share") {
    Share();
  } else if (action == "site-settings" && contents) {
    chrome::ShowSiteSettings(window->browser(),
                             contents->GetLastCommittedURL());
  } else if (action == "extensions") {
    RunBrowserCommand(window->browser(), "extensions");
  }
}

void RailSitePanelUI::CaptureScreenshot() {
  content::WebContents* contents = Target();
  content::RenderWidgetHostView* view =
      contents ? contents->GetRenderWidgetHostView() : nullptr;
  if (!view) {
    return;
  }
  view->CopyFromSurface(
      gfx::Rect(), gfx::Size(), base::TimeDelta(),
      base::BindPostTaskToCurrentDefault(base::BindOnce(
          &RailSitePanelUI::OnScreenshot, weak_factory_.GetWeakPtr())));
}

void RailSitePanelUI::OnScreenshot(
    const content::CopyFromSurfaceResult& result) {
  if (!result.has_value() || result->bitmap.drawsNothing()) {
    return;
  }
  ui::ScopedClipboardWriter(ui::ClipboardBuffer::kCopyPaste)
      .WriteImage(result->bitmap);
  ShowToast("Copied screenshot", "camera");
}

void RailSitePanelUI::CopyLink() {
  content::WebContents* contents = Target();
  if (!contents) {
    return;
  }
  ui::ScopedClipboardWriter(ui::ClipboardBuffer::kCopyPaste)
      .WriteText(base::UTF8ToUTF16(contents->GetLastCommittedURL().spec()));
  ShowToast("Copied URL", "link");
}

void RailSitePanelUI::ShowToast(const std::string& message,
                                const std::string& icon) {
  WebUIBrowserWindow* window = Window();
  if (!window) {
    return;
  }
  if (webui_browser::mojom::Page* page = window->GetWebUIBrowserUI()->page()) {
    page->ShowRailToast(message, icon);
  }
}

void RailSitePanelUI::Share() {
#if BUILDFLAG(IS_WIN)
  content::WebContents* contents = Target();
  WebUIBrowserWindow* window = Window();
  if (!contents || !window || !window->widget()) {
    return;
  }
  share_operation_ = std::make_unique<webshare::ShowShareUIForWindowOperation>(
      views::HWNDForWidget(window->widget()));
  share_operation_->Run(base::BindOnce(&PutShareData, contents->GetTitle(),
                                       contents->GetLastCommittedURL()));
#endif
}

void RailSitePanelUI::ShowPageInfoBubble() {
  content::WebContents* contents = Target();
  WebUIBrowserWindow* window = Window();
  if (!contents || !window || !window->widget()) {
    return;
  }
  std::unique_ptr<PageInfoBubbleSpecification> specification =
      PageInfoBubbleSpecification::Builder(
          views::BubbleAnchor(),
          window->GetNativeWindow(), contents,
          contents->GetLastCommittedURL())
          .AddAnchorRect(gfx::Rect(anchor_, gfx::Size(1, 1)))
          .Build();
  views::BubbleDialogDelegateView* const bubble =
      PageInfoBubbleView::CreatePageInfoBubble(std::move(specification));
  bubble->GetWidget()->Show();
}

void RailSitePanelUI::ActivateExtension(const std::string& id) {
  WebUIToolbarExtensionsContainer* container = Extensions();
  Close();
  if (container && container->GetActionForId(id)) {
    container->ExecuteUserAction(id, /*is_pointer_interaction=*/false);
  }
}

void RailSitePanelUI::ShowExtensionMenu(const std::string& id) {
  WebUIToolbarExtensionsContainer* container = Extensions();
  Close();
  if (container && container->GetActionForId(id)) {
    container->ShowContextMenu(ui::mojom::MenuSourceType::kMouse, id);
  }
}

void RailSitePanelUI::SetExtensionPinned(const std::string& id, bool pinned) {
  content::WebContents* contents = Target();
  if (!contents) {
    return;
  }
  ToolbarActionsModel* model = ToolbarActionsModel::Get(
      Profile::FromBrowserContext(contents->GetBrowserContext()));
  if (model && model->HasAction(id)) {
    model->SetActionVisibility(id, pinned);
  }
  Push();
}

void RailSitePanelUI::TogglePermission(int32_t index) {
  if (!page_info_ || index < 0 ||
      static_cast<size_t>(index) >= permissions_.size()) {
    return;
  }
  PageInfo::PermissionInfo permission = permissions_[index];
  PageInfoUI::ToggleBetweenAllowAndBlock(permission);
  page_info_->OnSitePermissionChanged(permission.type, permission.setting,
                                      permission.requesting_origin,
                                      permission.is_one_time);
}

void RailSitePanelUI::Close() {
  if (embedder()) {
    embedder()->CloseUI();
  }
}

WEB_UI_CONTROLLER_TYPE_IMPL(RailSitePanelUI)

}
