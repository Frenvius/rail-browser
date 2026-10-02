#include "chrome/browser/ui/webui_browser/rail/rail_menu.h"

#include <algorithm>
#include <map>
#include <set>
#include <utility>

#include "base/functional/bind.h"
#include "base/location.h"
#include "base/task/single_thread_task_runner.h"
#include "base/strings/string_number_conversions.h"
#include "base/strings/string_split.h"
#include "base/strings/utf_string_conversions.h"
#include "cc/paint/paint_flags.h"
#include "chrome/browser/ui/webui_browser/rail/rail_acrylic.h"
#include "third_party/skia/include/core/SkColor.h"
#include "ui/base/accelerators/accelerator.h"
#include "ui/base/metadata/metadata_header_macros.h"
#include "ui/base/metadata/metadata_impl_macros.h"
#include "ui/base/mojom/menu_source_type.mojom.h"
#include "ui/color/color_id.h"
#include "ui/display/screen.h"
#include "ui/events/event_constants.h"
#include "ui/events/keycodes/keyboard_codes.h"
#include "ui/gfx/canvas.h"
#include "ui/gfx/geometry/insets.h"
#include "ui/gfx/geometry/point.h"
#include "ui/gfx/geometry/point_f.h"
#include "ui/gfx/geometry/rect.h"
#include "ui/gfx/geometry/size.h"
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

namespace rail {

namespace {

constexpr int kFirstCommandId = 1;
constexpr int kSwatchCell = 26;
constexpr float kSwatchRadius = 8.f;
constexpr float kSwatchRingGap = 3.5f;
constexpr float kSwatchRingWidth = 1.5f;
constexpr int kSwatchGap = 4;
constexpr int kSwatchRowVerticalInset = 4;
constexpr int kSwatchRowHorizontalInset = 8;
constexpr int kSlideAnchorSlack = 4;

bool ParseAccelerator(const std::string& value, ui::Accelerator* out) {
  if (value.empty()) {
    return false;
  }
  int modifiers = 0;
  std::vector<std::string> parts = base::SplitString(
      value, "+", base::TRIM_WHITESPACE, base::SPLIT_WANT_ALL);
  if (parts.empty()) {
    return false;
  }
  const std::string key = parts.back();
  parts.pop_back();
  for (const std::string& part : parts) {
    if (part == "Ctrl") {
      modifiers |= ui::EF_CONTROL_DOWN;
    } else if (part == "Alt") {
      modifiers |= ui::EF_ALT_DOWN;
    } else if (part == "Shift") {
      modifiers |= ui::EF_SHIFT_DOWN;
    } else {
      return false;
    }
  }
  ui::KeyboardCode code = ui::VKEY_UNKNOWN;
  if (key.size() == 1 && key[0] >= 'A' && key[0] <= 'Z') {
    code = static_cast<ui::KeyboardCode>(ui::VKEY_A + (key[0] - 'A'));
  } else if (key == ",") {
    code = ui::VKEY_OEM_COMMA;
  } else if (key == "Left") {
    code = ui::VKEY_LEFT;
  } else if (key == "Right") {
    code = ui::VKEY_RIGHT;
  } else if (key == "Esc") {
    code = ui::VKEY_ESCAPE;
  } else if (key == "Delete") {
    code = ui::VKEY_DELETE;
  } else if (key.size() >= 2 && key[0] == 'F') {
    int number = 0;
    if (!base::StringToInt(key.substr(1), &number) || number < 1 ||
        number > 12) {
      return false;
    }
    code = static_cast<ui::KeyboardCode>(ui::VKEY_F1 + (number - 1));
  } else {
    return false;
  }
  *out = ui::Accelerator(code, modifiers);
  return true;
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

  void SetAccelerator(int command_id, const ui::Accelerator& accelerator) {
    accelerators_[command_id] = accelerator;
  }

  bool GetAcceleratorForCommandId(int command_id,
                                  ui::Accelerator* accelerator) const override {
    const auto entry = accelerators_.find(command_id);
    if (entry == accelerators_.end()) {
      return false;
    }
    *accelerator = entry->second;
    return true;
  }

  bool IsCommandIdChecked(int command_id) const override {
    return checked_.count(command_id) > 0;
  }

  void Disable(int command_id) { disabled_.insert(command_id); }

  bool IsCommandIdEnabled(int command_id) const override {
    return disabled_.count(command_id) == 0;
  }

  void ExecuteCommand(int command_id, int event_flags) override {
    const auto entry = commands_.find(command_id);
    if (entry != commands_.end() && !entry->second.empty()) {
      on_command_.Run(entry->second);
    }
  }

 private:
  base::RepeatingCallback<void(const std::string&)> on_command_;
  std::map<int, std::string> commands_;
  std::map<int, ui::Accelerator> accelerators_;
  std::set<int> checked_;
  std::set<int> disabled_;
  int next_id_ = kFirstCommandId;
};

class RailMenu::Adapter : public views::MenuModelAdapter {
 public:
  using MenuCallback = base::RepeatingCallback<void(views::MenuItemView*)>;

  Adapter(ui::MenuModel* model,
          base::RepeatingClosure on_closed,
          MenuCallback on_will_show)
      : views::MenuModelAdapter(model, std::move(on_closed)),
        on_will_show_(std::move(on_will_show)) {}

  void WillShowMenu(views::MenuItemView* menu) override {
    views::MenuModelAdapter::WillShowMenu(menu);
    base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
        FROM_HERE, base::BindOnce(on_will_show_, menu));
  }

 private:
  MenuCallback on_will_show_;
};

RailMenu::RailMenu(base::RepeatingCallback<void(const std::string&)> on_command,
                   base::RepeatingClosure on_closed)
    : delegate_(std::make_unique<Delegate>(on_command)),
      model_(std::make_unique<ui::SimpleMenuModel>(delegate_.get())),
      on_command_(std::move(on_command)),
      on_closed_(std::move(on_closed)) {}

RailMenu::~RailMenu() = default;

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
      base::BindRepeating(&RailMenu::StyleSubmenu, weak_factory_.GetWeakPtr()));
  std::unique_ptr<views::MenuItemView> root = adapter_->CreateMenu();
  root_ = root.get();
  Decorate();
  runner_ = std::make_unique<views::MenuRunner>(
      std::move(root), views::MenuRunner::CONTEXT_MENU);

  cursor_ = display::Screen::Get()->GetCursorScreenPoint();
  runner_->RunMenuAt(parent, nullptr, gfx::Rect(cursor_, gfx::Size()),
                     views::MenuAnchorPosition::kBubbleTopLeft,
                     ui::mojom::MenuSourceType::kMouse);

  StyleSubmenu(root_);
}

void RailMenu::StyleSubmenu(views::MenuItemView* item) {
  views::SubmenuView* submenu = item ? item->GetSubmenu() : nullptr;
  if (!submenu || !submenu->IsShowing()) {
    return;
  }
  views::MenuScrollViewContainer* container = submenu->GetScrollViewContainer();
  views::Widget* menu_widget = submenu->GetWidget();
  if (!menu_widget) {
    return;
  }
  container->SetBackground(views::CreateSolidBackground(SK_ColorTRANSPARENT));
  if (!backdrops_.count(menu_widget)) {
    backdrops_[menu_widget] =
        ApplyAcrylicBackdrop(menu_widget, container->outside_border_insets());
  }
  if (!observations_.IsObservingSource(menu_widget)) {
    observations_.AddObservation(menu_widget);
  }
  submenu_items_[menu_widget] = item;

  const gfx::Rect menu_bounds = menu_widget->GetWindowBoundsInScreen();
  const gfx::Rect window_bounds = parent_->GetWindowBoundsInScreen();
  const int anchor_y =
      item == root_ ? cursor_.y() : item->GetBoundsInScreen().y();
  const int anchor_bottom = item == root_
                                ? cursor_.y()
                                : item->GetBoundsInScreen().bottom();
  gfx::Rect bounds = item == root_
                         ? menu_bounds
                         : gfx::Rect(menu_bounds.origin(),
                                     container->GetPreferredSize({}));
  const bool constrained_upward = bounds.bottom() > window_bounds.bottom();
  if (constrained_upward) {
    bounds.set_y(std::max(window_bounds.y(), anchor_y - bounds.height()));
  } else if (item != root_) {
    bounds.set_y(item->GetBoundsInScreen().y() -
                 container->GetInsets().top());
  }
  if (bounds.y() < window_bounds.y()) {
    bounds.set_y(window_bounds.y());
  }
  if (bounds != menu_bounds) {
    menu_widget->SetBounds(bounds);
    RefreshClip(menu_widget);
  }
  const bool opens_upward =
      constrained_upward ||
      bounds.bottom() <= anchor_bottom + kSlideAnchorSlack;
  RefreshClip(menu_widget);
  RevealAcrylic(menu_widget, nullptr, backdrops_[menu_widget].get(),
                opens_upward ? kAcrylicSlideDistance : -kAcrylicSlideDistance,
                item == root_);
}

void RailMenu::OnWidgetVisibilityChanged(views::Widget* widget, bool visible) {
  if (visible) {
    return;
  }
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&RailMenu::CloseHiddenSubmenu,
                                weak_factory_.GetWeakPtr(), widget));
}

void RailMenu::CloseHiddenSubmenu(views::Widget* widget) {
  const auto entry = submenu_items_.find(widget);
  if (entry == submenu_items_.end() || entry->second == root_ || !runner_) {
    return;
  }
  views::SubmenuView* submenu = entry->second->GetSubmenu();
  if (submenu && submenu->GetWidget() == widget && !submenu->IsShowing()) {
    submenu->Close();
  }
}

void RailMenu::RefreshClip(views::Widget* widget) {
  const auto entry = backdrops_.find(widget);
  if (entry != backdrops_.end() && entry->second) {
    entry->second->UpdateClip();
  }
}

void RailMenu::OnWidgetBoundsChanged(views::Widget* widget,
                                     const gfx::Rect& new_bounds) {
  RefreshClip(widget);
  base::SingleThreadTaskRunner::GetCurrentDefault()->PostTask(
      FROM_HERE, base::BindOnce(&RailMenu::RefreshClip,
                                weak_factory_.GetWeakPtr(), widget));
}

void RailMenu::OnWidgetDestroying(views::Widget* widget) {
  observations_.RemoveObservation(widget);
  backdrops_.erase(widget);
  submenu_items_.erase(widget);
}

void RailMenu::OnClosed() {
  observations_.RemoveAllObservations();
  backdrops_.clear();
  submenu_items_.clear();
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
    if (item->command.empty() && item->children.empty()) {
      const int id = delegate_->Register(std::string(), false);
      delegate_->Disable(id);
      model->AddItem(id, label);
      continue;
    }
    if (!item->children.empty()) {
      auto submodel = std::make_unique<ui::SimpleMenuModel>(delegate_.get());
      Fill(submodel.get(), item->children);
      model->AddSubMenu(delegate_->Register(item->command, false), label,
                        submodel.get());
      submodels_.push_back(std::move(submodel));
      continue;
    }
    const int id = delegate_->Register(item->command, item->checked);
    ui::Accelerator accelerator;
    if (ParseAccelerator(item->accelerator, &accelerator)) {
      delegate_->SetAccelerator(id, accelerator);
    }
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
