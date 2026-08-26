#include "chrome/browser/ui/webui_browser/rail/rail_menu.h"

#include <windows.h>

#include <dwmapi.h>

#include <map>
#include <set>
#include <utility>

#include "base/functional/bind.h"
#include "base/location.h"
#include "base/task/single_thread_task_runner.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/utf_string_conversions.h"
#include "cc/paint/paint_canvas.h"
#include "components/viz/common/frame_timing_details.h"
#include "cc/paint/paint_flags.h"
#include "third_party/skia/include/core/SkColor.h"
#include "third_party/skia/include/core/SkRRect.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/base/mojom/menu_source_type.mojom.h"
#include "ui/color/color_id.h"
#include "ui/compositor/compositor.h"
#include "ui/display/screen.h"
#include "ui/gfx/canvas.h"
#include "ui/gfx/geometry/insets.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/point_f.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/size.h"
#include "ui/gfx/geometry/skia_conversions.h"
#include "ui/gfx/geometry/vector2d.h"
#include "ui/gfx/shadow_value.h"
#include "ui/gfx/skia_paint_util.h"
#include "ui/menus/simple_menu_model.h"
#include "ui/views/background.h"
#include "ui/views/controls/button/button.h"
#include "ui/views/controls/menu/menu_item_view.h"
#include "ui/views/controls/menu/menu_model_adapter.h"
#include "ui/views/controls/menu/menu_runner.h"
#include "ui/views/controls/menu/menu_scroll_view_container.h"
#include "ui/views/controls/menu/submenu_view.h"
#include "ui/views/layout/box_layout.h"
#include "ui/views/widget/widget.h"
#include "ui/views/win/hwnd_util.h"

namespace rail {

namespace {

constexpr int kFirstCommandId = 1;
constexpr SkColor kMenuTint = SkColorSetARGB(0xB0, 0x14, 0x14, 0x1C);
constexpr int kAccentEnableBlurBehind = 3;
constexpr int kWindowCompositionAttributeAccentPolicy = 19;
constexpr int kSwatchCell = 26;
constexpr float kSwatchRadius = 8.f;
constexpr float kSwatchRingGap = 3.5f;
constexpr float kSwatchRingWidth = 1.5f;
constexpr int kSwatchGap = 4;
constexpr int kSwatchRowVerticalInset = 4;
constexpr int kSwatchRowHorizontalInset = 8;
constexpr int kMenuCornerRadius = 8;
constexpr int kShadowMargin = 16;
constexpr int kShadowBlur = 16;
constexpr int kShadowOffsetY = 3;
constexpr SkAlpha kShadowAlpha = 0x33;

struct AccentPolicy {
  DWORD state;
  DWORD flags;
  DWORD gradient_color;
  DWORD animation_id;
};

struct WindowCompositionAttributeData {
  DWORD attribute;
  void* data;
  SIZE_T size;
};

using SetWindowCompositionAttributeFn =
    BOOL(WINAPI*)(HWND, WindowCompositionAttributeData*);

void ApplyAcrylicAccent(HWND hwnd) {
  static const auto set_attribute =
      reinterpret_cast<SetWindowCompositionAttributeFn>(::GetProcAddress(
          ::GetModuleHandleW(L"user32.dll"), "SetWindowCompositionAttribute"));
  if (!set_attribute) {
    return;
  }
  AccentPolicy policy = {};
  policy.state = kAccentEnableBlurBehind;
  WindowCompositionAttributeData data = {
      kWindowCompositionAttributeAccentPolicy, &policy, sizeof(policy)};
  set_attribute(hwnd, &data);
}

void ApplyAccentAfterPresent(HWND hwnd, const viz::FrameTimingDetails&) {
  if (::IsWindow(hwnd)) {
    ApplyAcrylicAccent(hwnd);
  }
}

void ApplyMenuBackdrop(views::Widget* widget) {
  if (!widget) {
    return;
  }
  HWND hwnd = views::HWNDForWidget(widget);
  if (!hwnd) {
    return;
  }
  const COLORREF border_color = DWMWA_COLOR_NONE;
  ::DwmSetWindowAttribute(hwnd, DWMWA_BORDER_COLOR, &border_color,
                          sizeof(border_color));

  const DWM_WINDOW_CORNER_PREFERENCE corner = DWMWCP_ROUND;
  ::DwmSetWindowAttribute(hwnd, DWMWA_WINDOW_CORNER_PREFERENCE, &corner,
                          sizeof(corner));

  ui::Compositor* compositor = widget->GetCompositor();
  if (!compositor) {
    ApplyAcrylicAccent(hwnd);
    return;
  }
  compositor->RequestSuccessfulPresentationTimeForNextFrame(
      base::BindOnce(&ApplyAccentAfterPresent, hwnd));
}

SkColor ParseColor(const std::string& value) {
  uint32_t rgb = 0;
  if (value.size() != 7 || value[0] != '#' ||
      !base::HexStringToUInt(value.substr(1), &rgb)) {
    return SK_ColorTRANSPARENT;
  }
  return SkColorSetRGB((rgb >> 16) & 0xFF, (rgb >> 8) & 0xFF, rgb & 0xFF);
}

class SwatchButton : public views::Button {
  METADATA_HEADER(SwatchButton, views::Button)

 public:
  SwatchButton(SkColor color, bool selected, PressedCallback callback)
      : views::Button(std::move(callback)),
        color_(color),
        selected_(selected) {
    SetPreferredSize(gfx::Size(kSwatchCell, kSwatchCell));
    SetFocusBehavior(FocusBehavior::NEVER);
  }

  SwatchButton(const SwatchButton&) = delete;
  SwatchButton& operator=(const SwatchButton&) = delete;
  ~SwatchButton() override = default;

 protected:
  void PaintButtonContents(gfx::Canvas* canvas) override {
    const gfx::PointF center(GetLocalBounds().CenterPoint());
    cc::PaintFlags flags;
    flags.setAntiAlias(true);
    flags.setStyle(cc::PaintFlags::kFill_Style);
    flags.setColor(color_);
    canvas->DrawCircle(center, kSwatchRadius, flags);

    const bool hovered = GetState() == views::Button::STATE_HOVERED ||
                         GetState() == views::Button::STATE_PRESSED;
    if (!selected_ && !hovered) {
      return;
    }
    flags.setStyle(cc::PaintFlags::kStroke_Style);
    flags.setStrokeWidth(kSwatchRingWidth);
    flags.setColor(selected_ ? SkColorSetA(SK_ColorWHITE, 0xE0)
                             : SkColorSetA(SK_ColorWHITE, 0x50));
    canvas->DrawCircle(center, kSwatchRadius + kSwatchRingGap, flags);
  }

 private:
  const SkColor color_;
  const bool selected_;
};

BEGIN_METADATA(SwatchButton)
END_METADATA

class SwatchRowView : public views::View {
  METADATA_HEADER(SwatchRowView, views::View)

 public:
  SwatchRowView(const std::vector<std::string>& colors,
                const std::string& selected,
                base::RepeatingCallback<void(const std::string&)> on_pick) {
    SetLayoutManager(std::make_unique<views::BoxLayout>(
        views::BoxLayout::Orientation::kHorizontal,
        gfx::Insets::VH(kSwatchRowVerticalInset, kSwatchRowHorizontalInset),
        kSwatchGap));
    for (const std::string& color : colors) {
      AddChildView(std::make_unique<SwatchButton>(
          ParseColor(color), color == selected,
          base::BindRepeating(on_pick, color)));
    }
  }

  SwatchRowView(const SwatchRowView&) = delete;
  SwatchRowView& operator=(const SwatchRowView&) = delete;
  ~SwatchRowView() override = default;
};

BEGIN_METADATA(SwatchRowView)
END_METADATA

class ShadowView : public views::View {
  METADATA_HEADER(ShadowView, views::View)

 public:
  ShadowView() = default;
  ShadowView(const ShadowView&) = delete;
  ShadowView& operator=(const ShadowView&) = delete;
  ~ShadowView() override = default;

 protected:
  void OnPaint(gfx::Canvas* canvas) override {
    gfx::Rect bounds = GetLocalBounds();
    bounds.Inset(kShadowMargin);
    const SkRRect rounded = SkRRect::MakeRectXY(
        gfx::RectToSkRect(bounds), kMenuCornerRadius, kMenuCornerRadius);

    cc::PaintFlags flags;
    flags.setAntiAlias(true);
    flags.setStyle(cc::PaintFlags::kFill_Style);
    flags.setColor(SK_ColorBLACK);
    flags.setLooper(gfx::CreateShadowDrawLooper(
        {gfx::ShadowValue(gfx::Vector2d(0, kShadowOffsetY), kShadowBlur,
                          SkColorSetA(SK_ColorBLACK, kShadowAlpha))}));

    cc::PaintCanvas* sk_canvas = canvas->sk_canvas();
    sk_canvas->save();
    sk_canvas->clipRRect(rounded, SkClipOp::kDifference, true);
    sk_canvas->drawRRect(rounded, flags);
    sk_canvas->restore();
  }
};

BEGIN_METADATA(ShadowView)
END_METADATA

}

class RailMenu::Delegate : public ui::SimpleMenuModel::Delegate {
 public:
  explicit Delegate(
      base::RepeatingCallback<void(const std::string&)> on_command)
      : on_command_(std::move(on_command)) {}
  ~Delegate() override = default;

  int Register(const std::string& command, bool checked) {
    const int id = next_id_++;
    commands_[id] = command;
    if (checked) {
      checked_.insert(id);
    }
    return id;
  }

  bool IsCommandIdChecked(int command_id) const override {
    return checked_.count(command_id) > 0;
  }

  bool IsCommandIdEnabled(int command_id) const override { return true; }

  void ExecuteCommand(int command_id, int event_flags) override {
    const auto entry = commands_.find(command_id);
    if (entry != commands_.end() && !entry->second.empty()) {
      on_command_.Run(entry->second);
    }
  }

 private:
  base::RepeatingCallback<void(const std::string&)> on_command_;
  std::map<int, std::string> commands_;
  std::set<int> checked_;
  int next_id_ = kFirstCommandId;
};

class RailMenu::Adapter : public views::MenuModelAdapter {
 public:
  using MenuCallback = base::RepeatingCallback<void(views::MenuItemView*)>;

  Adapter(ui::MenuModel* model,
          base::RepeatingClosure on_closed,
          MenuCallback on_will_show,
          MenuCallback on_will_hide)
      : views::MenuModelAdapter(model, std::move(on_closed)),
        on_will_show_(std::move(on_will_show)),
        on_will_hide_(std::move(on_will_hide)) {}

  void WillShowMenu(views::MenuItemView* menu) override {
    views::MenuModelAdapter::WillShowMenu(menu);
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(on_will_show_, menu));
  }

  void WillHideMenu(views::MenuItemView* menu) override {
    views::MenuModelAdapter::WillHideMenu(menu);
    on_will_hide_.Run(menu);
  }

 private:
  MenuCallback on_will_show_;
  MenuCallback on_will_hide_;
};

RailMenu::RailMenu(base::RepeatingCallback<void(const std::string&)> on_command,
                   base::RepeatingClosure on_closed)
    : delegate_(std::make_unique<Delegate>(on_command)),
      model_(std::make_unique<ui::SimpleMenuModel>(delegate_.get())),
      on_command_(std::move(on_command)),
      on_closed_(std::move(on_closed)) {}

RailMenu::~RailMenu() {
  CloseShadows();
}

void RailMenu::ShowAtCursor(
    views::Widget* parent,
    const std::vector<webui_browser::mojom::RailMenuItemPtr>& items) {
  if (!parent) {
    return;
  }
  parent_ = parent;
  Fill(model_.get(), items);

  adapter_ = std::make_unique<Adapter>(
      model_.get(),
      base::BindRepeating(&RailMenu::OnClosed, weak_factory_.GetWeakPtr()),
      base::BindRepeating(&RailMenu::StyleSubmenu, weak_factory_.GetWeakPtr()),
      base::BindRepeating(&RailMenu::HideShadow, weak_factory_.GetWeakPtr()));
  std::unique_ptr<views::MenuItemView> root = adapter_->CreateMenu();
  root_ = root.get();
  Decorate();
  runner_ = std::make_unique<views::MenuRunner>(
      std::move(root), views::MenuRunner::CONTEXT_MENU);

  const gfx::Point cursor = display::Screen::Get()->GetCursorScreenPoint();
  runner_->RunMenuAt(parent, nullptr, gfx::Rect(cursor, gfx::Size()),
                     views::MenuAnchorPosition::kTopLeft,
                     ui::mojom::MenuSourceType::kMouse);

  StyleSubmenu(root_);
}

void RailMenu::StyleSubmenu(views::MenuItemView* item) {
  views::SubmenuView* submenu = item ? item->GetSubmenu() : nullptr;
  if (!submenu || !submenu->IsShowing()) {
    return;
  }
  submenu->GetScrollViewContainer()->SetBackground(
      views::CreateSolidBackground(kMenuTint));
  ApplyMenuBackdrop(submenu->GetWidget());
  AddShadow(item, submenu->GetWidget());
}

void RailMenu::AddShadow(views::MenuItemView* item,
                         views::Widget* menu_widget) {
  if (!menu_widget || !parent_ || shadows_.count(item)) {
    return;
  }
  gfx::Rect bounds = menu_widget->GetWindowBoundsInScreen();
  bounds.Inset(-kShadowMargin);

  views::Widget::InitParams params(
      views::Widget::InitParams::WIDGET_OWNS_NATIVE_WIDGET,
      views::Widget::InitParams::TYPE_MENU);
  params.opacity = views::Widget::InitParams::WindowOpacity::kTranslucent;
  params.shadow_type = views::Widget::InitParams::ShadowType::kNone;
  params.activatable = views::Widget::InitParams::Activatable::kNo;
  params.accept_events = false;
  params.parent = parent_->GetNativeView();
  params.bounds = bounds;

  auto shadow = std::make_unique<views::Widget>();
  shadow->Init(std::move(params));
  shadow->SetContentsView(std::make_unique<ShadowView>());
  shadow->ShowInactive();

  HWND shadow_hwnd = views::HWNDForWidget(shadow.get());
  HWND menu_hwnd = views::HWNDForWidget(menu_widget);
  if (shadow_hwnd && menu_hwnd) {
    ::SetWindowPos(menu_hwnd, HWND_TOP, 0, 0, 0, 0,
                   SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
    ::SetWindowPos(shadow_hwnd, menu_hwnd, 0, 0, 0, 0,
                   SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE);
  }
  shadows_[item] = std::move(shadow);
}

void RailMenu::HideShadow(views::MenuItemView* item) {
  const auto entry = shadows_.find(item);
  if (entry == shadows_.end()) {
    return;
  }
  entry->second->Close();
  shadows_.erase(entry);
}

void RailMenu::CloseShadows() {
  for (const auto& [item, shadow] : shadows_) {
    shadow->Close();
  }
  shadows_.clear();
}

void RailMenu::OnClosed() {
  CloseShadows();
  on_closed_.Run();
}

void RailMenu::Fill(
    ui::SimpleMenuModel* model,
    const std::vector<webui_browser::mojom::RailMenuItemPtr>& items) {
  for (const auto& item : items) {
    if (item->separator) {
      model->AddSeparator(ui::NORMAL_SEPARATOR);
      continue;
    }
    if (!item->swatches.empty()) {
      const int id = delegate_->Register(std::string(), false);
      model->AddItem(id, std::u16string());
      swatch_rows_.push_back(
          {id, item->command, item->swatches, item->selected});
      continue;
    }
    const std::u16string label = base::UTF8ToUTF16(item->label);
    if (!item->children.empty()) {
      auto submodel = std::make_unique<ui::SimpleMenuModel>(delegate_.get());
      Fill(submodel.get(), item->children);
      model->AddSubMenu(delegate_->Register(item->command, false), label,
                        submodel.get());
      submodels_.push_back(std::move(submodel));
      continue;
    }
    const int id = delegate_->Register(item->command, item->checked);
    if (item->danger) {
      danger_ids_.push_back(id);
    }
    if (item->checked) {
      model->AddCheckItem(id, label);
    } else {
      model->AddItem(id, label);
    }
  }
}

void RailMenu::Decorate() {
  for (int id : danger_ids_) {
    if (views::MenuItemView* item = root_->GetMenuItemByID(id)) {
      item->SetForegroundColorId(ui::kColorAlertHighSeverity);
    }
  }
  for (const SwatchRow& row : swatch_rows_) {
    views::MenuItemView* item = root_->GetMenuItemByID(row.id);
    if (!item) {
      continue;
    }
    item->AddChildView(std::make_unique<SwatchRowView>(
        row.colors, row.selected,
        base::BindRepeating(&RailMenu::OnSwatchPicked, base::Unretained(this),
                            row.command)));
    item->set_children_use_full_width(true);
  }
}

void RailMenu::OnSwatchPicked(const std::string& command,
                              const std::string& color) {
  on_command_.Run(command + color);
  runner_->Cancel();
}

}
