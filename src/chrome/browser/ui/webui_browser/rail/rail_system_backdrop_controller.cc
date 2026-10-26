#include "chrome/browser/ui/webui_browser/rail/rail_system_backdrop_controller.h"

#if BUILDFLAG(IS_WIN)

#include <windows.h>

#include <DispatcherQueue.h>
#include <d2d1effects.h>
#include <d3d11.h>
#include <dwmapi.h>
#include <roapi.h>
#include <windows.foundation.h>
#include <windows.graphics.directx.h>
#include <windows.graphics.effects.h>
#include <windows.graphics.effects.interop.h>
#include <windows.system.h>
#include <windows.ui.composition.desktop.h>
#include <windows.ui.h>
#include <windows.ui.composition.h>
#include <windows.ui.composition.interop.h>
#include <wrl/client.h>
#include <wrl/event.h>
#include <wrl/implements.h>
#include <wrl/wrappers/corewrappers.h>

#include <algorithm>
#include <cmath>
#include <iterator>
#include <string_view>
#include <unordered_map>

#include "base/logging.h"
#include "base/memory/raw_ptr.h"
#include "base/no_destructor.h"
#include "base/win/windows_version.h"
#include "chrome/browser/ui/webui_browser/rail/rail_window_frame.h"
#include "third_party/skia/include/core/SkBitmap.h"
#include "ui/color/color_provider_key.h"
#include "ui/views/widget/widget.h"
#include "ui/views/win/hwnd_util.h"

namespace rail {

namespace {

namespace wdx = ABI::Windows::Graphics::DirectX;
namespace wgfx = ABI::Windows::Graphics::Effects;
namespace wuc = ABI::Windows::UI::Composition;

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;
using Microsoft::WRL::Make;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::WinRtClassicComMix;
using Microsoft::WRL::Wrappers::HString;
using Microsoft::WRL::Wrappers::HStringReference;

using ABI::Windows::Foundation::IPropertyValue;
using ABI::Windows::Foundation::IPropertyValueStatics;

constexpr GUID kBlendEffectId = {
    0x81c5b77b,
    0x13f8,
    0x4cdd,
    {0xad, 0x20, 0xc8, 0x90, 0x54, 0x7a, 0xc6, 0x5d}};
constexpr GUID kFloodEffectId = {
    0x61c23c20,
    0xae69,
    0x4d8e,
    {0x94, 0xcf, 0x50, 0x07, 0x8d, 0xf6, 0x38, 0xf2}};

constexpr wchar_t kBackdropSourceName[] = L"backdrop";
constexpr wchar_t kTintName[] = L"Tint";
constexpr wchar_t kLuminosityName[] = L"Luminosity";
constexpr const wchar_t* kAnimatedColors[] = {L"Tint.Color",
                                              L"Luminosity.Color"};
constexpr float kThinLuminosityScale = 0.5f;
constexpr float kAltTintScale = 1.5f;
constexpr base::TimeDelta kRecolorDuration = base::Milliseconds(300);
constexpr base::TimeDelta kActivationFadeDuration = base::Milliseconds(250);
constexpr ABI::Windows::UI::Color kDarkNeutralColor = {255, 0x1a, 0x1a, 0x1a};
constexpr ABI::Windows::UI::Color kLightNeutralColor = {255, 0xe6, 0xe6,
                                                        0xe6};

class AnimatedColorCursor
    : public RuntimeClass<
          RuntimeClassFlags<WinRtClassicComMix>,
          ABI::Windows::Foundation::Collections::IIterator<HSTRING>> {
 public:
  HRESULT STDMETHODCALLTYPE get_Current(HSTRING* current) override {
    if (!current) {
      return E_POINTER;
    }
    if (index_ >= std::size(kAnimatedColors)) {
      return E_BOUNDS;
    }
    return HStringReference(kAnimatedColors[index_]).CopyTo(current);
  }
  HRESULT STDMETHODCALLTYPE get_HasCurrent(boolean* has_current) override {
    if (!has_current) {
      return E_POINTER;
    }
    *has_current = index_ < std::size(kAnimatedColors);
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE MoveNext(boolean* has_current) override {
    if (index_ < std::size(kAnimatedColors)) {
      ++index_;
    }
    return get_HasCurrent(has_current);
  }
  HRESULT STDMETHODCALLTYPE GetMany(unsigned capacity,
                                    HSTRING* items,
                                    unsigned* count) override {
    if (!items || !count) {
      return E_POINTER;
    }
    *count = 0;
    while (*count < capacity && index_ < std::size(kAnimatedColors)) {
      HRESULT hr =
          HStringReference(kAnimatedColors[index_]).CopyTo(&items[*count]);
      if (FAILED(hr)) {
        return hr;
      }
      ++index_;
      ++*count;
    }
    return S_OK;
  }

 private:
  size_t index_ = 0;
};

class AnimatedColors
    : public RuntimeClass<
          RuntimeClassFlags<WinRtClassicComMix>,
          ABI::Windows::Foundation::Collections::IIterable<HSTRING>> {
 public:
  HRESULT STDMETHODCALLTYPE
  First(ABI::Windows::Foundation::Collections::IIterator<HSTRING>** first)
      override {
    if (!first) {
      return E_POINTER;
    }
    auto cursor = Make<AnimatedColorCursor>();
    if (!cursor) {
      return E_OUTOFMEMORY;
    }
    *first = cursor.Detach();
    return S_OK;
  }
};

class Effect : public RuntimeClass<RuntimeClassFlags<WinRtClassicComMix>,
                                   wgfx::IGraphicsEffect,
                                   wgfx::IGraphicsEffectSource,
                                   wgfx::IGraphicsEffectD2D1Interop> {
 public:
  explicit Effect(REFCLSID id) : id_(id) {
    ABI::Windows::Foundation::GetActivationFactory(
        HStringReference(RuntimeClass_Windows_Foundation_PropertyValue).Get(),
        &values_);
  }

  HRESULT STDMETHODCALLTYPE get_Name(HSTRING* name) override {
    return name_.CopyTo(name);
  }
  HRESULT STDMETHODCALLTYPE put_Name(HSTRING name) override {
    return name_.Set(name);
  }
  HRESULT STDMETHODCALLTYPE GetEffectId(GUID* id) override {
    if (!id) {
      return E_POINTER;
    }
    *id = id_;
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE GetNamedPropertyMapping(
      LPCWSTR name,
      UINT* index,
      wgfx::GRAPHICS_EFFECT_PROPERTY_MAPPING* mapping) override {
    if (!name || !index || !mapping) {
      return E_POINTER;
    }
    if (!IsEqualGUID(id_, kFloodEffectId) ||
        std::wstring_view(name) != L"Color") {
      return E_INVALIDARG;
    }
    *index = D2D1_FLOOD_PROP_COLOR;
    *mapping = wgfx::GRAPHICS_EFFECT_PROPERTY_MAPPING_COLOR_TO_VECTOR4;
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE GetPropertyCount(UINT* count) override {
    if (!count) {
      return E_POINTER;
    }
    *count = static_cast<UINT>(properties_.size());
    return S_OK;
  }
  HRESULT STDMETHODCALLTYPE GetProperty(UINT index,
                                        IPropertyValue** value) override {
    if (!value) {
      return E_POINTER;
    }
    auto property = properties_.find(index);
    return property == properties_.end() ? E_INVALIDARG
                                         : property->second.CopyTo(value);
  }
  HRESULT STDMETHODCALLTYPE
  GetSource(UINT index, wgfx::IGraphicsEffectSource** source) override {
    if (!source) {
      return E_POINTER;
    }
    auto entry = sources_.find(index);
    return entry == sources_.end() ? E_INVALIDARG : entry->second.CopyTo(source);
  }
  HRESULT STDMETHODCALLTYPE GetSourceCount(UINT* count) override {
    if (!count) {
      return E_POINTER;
    }
    *count = static_cast<UINT>(sources_.size());
    return S_OK;
  }

  void SetSource(UINT index, wgfx::IGraphicsEffectSource* source) {
    sources_[index] = source;
  }

  bool SetUInt32(UINT index, UINT32 value) {
    if (!values_) {
      return false;
    }
    ComPtr<IPropertyValue> property;
    if (FAILED(values_->CreateUInt32(value, &property))) {
      return false;
    }
    properties_[index] = property;
    return true;
  }

  bool SetColor(UINT index, const float (&value)[4]) {
    if (!values_) {
      return false;
    }
    ComPtr<IPropertyValue> property;
    if (FAILED(values_->CreateSingleArray(4, const_cast<float*>(value),
                                          &property))) {
      return false;
    }
    properties_[index] = property;
    return true;
  }

 private:
  const CLSID id_;
  HString name_;
  ComPtr<IPropertyValueStatics> values_;
  std::unordered_map<UINT, ComPtr<IPropertyValue>> properties_;
  std::unordered_map<UINT, ComPtr<wgfx::IGraphicsEffectSource>> sources_;
};

bool UsesWallpaperBackdrop(SystemBackdropMaterial material) {
  return material == SystemBackdropMaterial::kMica ||
         material == SystemBackdropMaterial::kMicaAlt;
}

DWM_SYSTEMBACKDROP_TYPE ToDwmBackdrop(SystemBackdropMaterial material) {
  switch (material) {
    case SystemBackdropMaterial::kMica:
      return DWMSBT_MAINWINDOW;
    case SystemBackdropMaterial::kMicaAlt:
      return DWMSBT_TABBEDWINDOW;
    case SystemBackdropMaterial::kAcrylic:
    case SystemBackdropMaterial::kAcrylicThin:
      return DWMSBT_TRANSIENTWINDOW;
  }
}

void FillChannels(SkColor color, float alpha, float (&out)[4]) {
  out[0] = SkColorGetR(color) / 255.0f;
  out[1] = SkColorGetG(color) / 255.0f;
  out[2] = SkColorGetB(color) / 255.0f;
  out[3] = std::clamp(alpha, 0.0f, 1.0f);
}

ABI::Windows::UI::Color ChannelsToColor(const float (&channels)[4]) {
  const auto byte = [](float value) {
    return static_cast<BYTE>(std::lround(value * 255.0f));
  };
  return {byte(channels[3]), byte(channels[0]), byte(channels[1]),
          byte(channels[2])};
}

}  // namespace

class SystemBackdropController::Impl {
 public:
  Impl(views::Widget* widget, const SystemBackdropConfig& config)
      : widget_(widget), hwnd_(views::HWNDForWidget(widget)), config_(config) {}

  ~Impl() {
    ReleaseFadeBatch();
    if (!desktop_target_) {
      return;
    }
    ComPtr<wuc::ICompositionTarget> target;
    if (SUCCEEDED(desktop_target_.As(&target))) {
      target->put_Root(nullptr);
    }
    ComPtr<ABI::Windows::Foundation::IClosable> closable;
    if (SUCCEEDED(desktop_target_.As(&closable))) {
      closable->Close();
    }
  }

  bool Initialize() {
    if (!widget_ || !hwnd_ ||
        base::win::GetVersion() < base::win::Version::WIN11_22H2) {
      return false;
    }
    if (config_.popup) {
      active_ = true;
    } else {
      dark_mode_ =
          widget_->GetColorMode() == ui::ColorProviderKey::ColorMode::kDark;
      active_ = widget_->ShouldPaintAsActive();
      ApplyDwmDarkMode();
      PrepareSystemBackdropWindow(widget_);
    }

    composition_ = InitializeComposition();
    if (!composition_) {
      ApplyDwmFallback();
    }
    return true;
  }

  void SetConfig(const SystemBackdropConfig& config) {
    const bool recolor = composition_ && effect_brush_ && fallback_brush_ &&
                         config.material == config_.material &&
                         config.popup == config_.popup;
    const bool brush_changed =
        UsesWallpaperBackdrop(config.material) !=
        UsesWallpaperBackdrop(config_.material);
    config_ = config;
    if (recolor && AnimateColors()) {
      return;
    }
    effect_brush_.Reset();
    fallback_brush_.Reset();
    if (!composition_) {
      ApplyDwmFallback();
      return;
    }
    if (brush_changed && !CreateBackdropBrush()) {
      composition_ = false;
      ApplyDwmFallback();
      return;
    }
    UpdateSpriteBrush();
  }

  void SetActive(bool active) {
    if (active_ == active) {
      return;
    }
    active_ = active;
    if (!composition_ || !sprite_ || !cover_) {
      return;
    }
    if (!active_) {
      FadeCover(1.0f);
      return;
    }
    if (!effect_brush_) {
      effect_brush_ = CreateBackdropEffectBrush();
    }
    if (effect_brush_) {
      sprite_->put_Brush(effect_brush_.Get());
      FadeCover(0.0f);
    }
  }

  void SetDarkMode(bool dark_mode) {
    dark_mode_ = dark_mode;
    ApplyDwmDarkMode();
    ComPtr<wuc::ICompositionObject> neutral;
    if (composition_ && neutral_brush_ &&
        SUCCEEDED(neutral_brush_.As(&neutral))) {
      StartColorAnimation(neutral.Get(), L"Color", NeutralColor());
    }
  }

  void UpdateClip() {
    ComPtr<wuc::IVisual> visual;
    if (config_.corner_radius > 0.0f && sprite_ &&
        SUCCEEDED(sprite_.As(&visual))) {
      ApplyRoundedClip(visual.Get());
    }
  }

  void HideReveal() {
    ComPtr<wuc::ICompositionObject> target;
    ComPtr<wuc::IVisual> visual;
    if (!sprite_ || FAILED(sprite_.As(&target)) ||
        FAILED(sprite_.As(&visual))) {
      return;
    }
    target->StopAnimation(HStringReference(L"Opacity").Get());
    visual->put_Opacity(0.0f);
  }

  void PlayReveal(float offset_y, base::TimeDelta duration) {
    if (!sprite_) {
      return;
    }
    ComPtr<wuc::ICubicBezierEasingFunction> bezier;
    ComPtr<wuc::ICompositionEasingFunction> easing;
    if (FAILED(compositor_->CreateCubicBezierEasingFunction(
            {0.1f, 0.9f}, {0.2f, 1.0f}, &bezier)) ||
        FAILED(bezier.As(&easing))) {
      return;
    }
    ComPtr<wuc::ICompositionObject> target;
    if (FAILED(sprite_.As(&target))) {
      return;
    }
    StartScalarAnimation(target.Get(), L"Offset.Y", offset_y, 0.0f, duration,
                         easing.Get());
    StartScalarAnimation(target.Get(), L"Opacity", 0.0f, 1.0f, duration,
                         easing.Get());
  }

  bool PlayDrawerReveal(const SkBitmap& content,
                        float hidden_fraction,
                        bool from_bottom,
                        base::TimeDelta duration) {
    ComPtr<wuc::ICompositionObject> target;
    ComPtr<wuc::IVisual> visual;
    if (!sprite_ || FAILED(sprite_.As(&target)) ||
        FAILED(sprite_.As(&visual))) {
      return false;
    }
    visual->put_Opacity(1.0f);
    ComPtr<wuc::ICubicBezierEasingFunction> bezier;
    ComPtr<wuc::ICompositionEasingFunction> easing;
    ComPtr<wuc::ICompositionObject> content_target;
    if (FAILED(compositor_->CreateCubicBezierEasingFunction(
            {0.0f, 0.0f}, {0.0f, 1.0f}, &bezier)) ||
        FAILED(bezier.As(&easing)) || !ShowDrawerContent(content) ||
        FAILED(content_.As(&content_target))) {
      ClearDrawerContent();
      return false;
    }
    RECT client = {};
    ::GetClientRect(hwnd_, &client);
    const float height =
        client.bottom - config_.popup_insets.height() * DpiScale();
    const float shift = height * hidden_fraction;
    visual->put_CenterPoint({0.0f, from_bottom ? height : 0.0f, 0.0f});
    StartScalarAnimation(target.Get(), L"Scale.Y", 1.0f - hidden_fraction, 1.0f,
                         duration, easing.Get());
    StartScalarAnimation(content_target.Get(), L"Offset.Y",
                         from_bottom ? shift : -shift, 0.0f, duration,
                         easing.Get());
    return true;
  }

  void ClearDrawerContent() {
    ComPtr<wuc::IVisualCollection> children;
    ComPtr<wuc::IVisual> visual;
    if (content_ && root_ && SUCCEEDED(root_->get_Children(&children)) &&
        SUCCEEDED(content_.As(&visual))) {
      children->Remove(visual.Get());
    }
    content_.Reset();
  }

 private:
  bool ShowDrawerContent(const SkBitmap& content) {
    ClearDrawerContent();
    ComPtr<wuc::ICompositionGraphicsDevice> device =
        SharedGraphicsDevice(compositor_.Get());
    ComPtr<wuc::IVisualCollection> children;
    SkBitmap pixels;
    if (!device || !root_ || content.drawsNothing() ||
        !pixels.tryAllocPixels(content.info()
                                   .makeColorType(kBGRA_8888_SkColorType)
                                   .makeAlphaType(kPremul_SkAlphaType)) ||
        !content.readPixels(pixels.pixmap()) ||
        FAILED(root_->get_Children(&children))) {
      return false;
    }
    const UINT width = pixels.width();
    const UINT height = pixels.height();
    ComPtr<wuc::ICompositionDrawingSurface> surface;
    ComPtr<wuc::ICompositionDrawingSurfaceInterop> drawing;
    if (FAILED(device->CreateDrawingSurface(
            {static_cast<float>(width), static_cast<float>(height)},
            wdx::DirectXPixelFormat_B8G8R8A8UIntNormalized,
            wdx::DirectXAlphaMode_Premultiplied, &surface)) ||
        FAILED(surface.As(&drawing))) {
      return false;
    }
    ComPtr<ID3D11Texture2D> texture;
    POINT offset = {};
    if (FAILED(drawing->BeginDraw(nullptr, IID_PPV_ARGS(&texture), &offset))) {
      return false;
    }
    ComPtr<ID3D11Device> d3d;
    ComPtr<ID3D11DeviceContext> context;
    texture->GetDevice(&d3d);
    d3d->GetImmediateContext(&context);
    const D3D11_BOX box = {static_cast<UINT>(offset.x),
                           static_cast<UINT>(offset.y),
                           0,
                           static_cast<UINT>(offset.x) + width,
                           static_cast<UINT>(offset.y) + height,
                           1};
    context->UpdateSubresource(texture.Get(), 0, &box, pixels.getPixels(),
                               pixels.rowBytes(), 0);
    if (FAILED(drawing->EndDraw())) {
      return false;
    }

    ComPtr<wuc::ICompositionSurface> source;
    ComPtr<wuc::ICompositionSurfaceBrush> surface_brush;
    ComPtr<wuc::ICompositionBrush> brush;
    ComPtr<wuc::ISpriteVisual> sprite;
    ComPtr<wuc::IVisual> visual;
    if (FAILED(surface.As(&source)) ||
        FAILED(compositor_->CreateSurfaceBrushWithSurface(source.Get(),
                                                          &surface_brush)) ||
        FAILED(surface_brush->put_Stretch(wuc::CompositionStretch_None)) ||
        FAILED(surface_brush.As(&brush)) ||
        FAILED(compositor_->CreateSpriteVisual(&sprite)) ||
        FAILED(sprite->put_Brush(brush.Get())) || FAILED(sprite.As(&visual)) ||
        FAILED(visual->put_Size(
            {static_cast<float>(width), static_cast<float>(height)})) ||
        FAILED(children->InsertAtTop(visual.Get()))) {
      return false;
    }
    content_ = sprite;
    return true;
  }

  static ComPtr<wuc::ICompositionGraphicsDevice> SharedGraphicsDevice(
      wuc::ICompositor* compositor) {
    static base::NoDestructor<ComPtr<wuc::ICompositionGraphicsDevice>> device;
    if (*device) {
      return *device;
    }
    ComPtr<ID3D11Device> d3d;
    ComPtr<wuc::ICompositorInterop> interop;
    const HRESULT hr =
        ::D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr,
                            D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0,
                            D3D11_SDK_VERSION, &d3d, nullptr, nullptr);
    if (FAILED(hr) ||
        FAILED(compositor->QueryInterface(IID_PPV_ARGS(&interop))) ||
        FAILED(interop->CreateGraphicsDevice(d3d.Get(), &*device))) {
      VLOG(1) << "Composition graphics device creation failed: 0x" << std::hex
              << hr;
      device->Reset();
    }
    return *device;
  }

  void StartScalarAnimation(wuc::ICompositionObject* target,
                            const wchar_t* property,
                            float from,
                            float to,
                            base::TimeDelta duration,
                            wuc::ICompositionEasingFunction* easing) {
    ComPtr<wuc::IScalarKeyFrameAnimation> scalar;
    ComPtr<wuc::IKeyFrameAnimation> frames;
    ComPtr<wuc::ICompositionAnimation> animation;
    if (FAILED(compositor_->CreateScalarKeyFrameAnimation(&scalar)) ||
        FAILED(scalar.As(&frames)) || FAILED(scalar.As(&animation))) {
      return;
    }
    const ABI::Windows::Foundation::TimeSpan span = {
        duration.InMicroseconds() * 10};
    frames->put_Duration(span);
    scalar->InsertKeyFrame(0.0f, from);
    scalar->InsertKeyFrameWithEasingFunction(1.0f, to, easing);
    target->StartAnimation(HStringReference(property).Get(), animation.Get());
  }

  bool InitializeComposition() {
    if (!CreateDispatcherQueue()) {
      return false;
    }

    compositor_ = SharedCompositor();
    if (!compositor_) {
      return false;
    }

    const BOOL host_backdrop = TRUE;
    ::DwmSetWindowAttribute(hwnd_, DWMWA_USE_HOSTBACKDROPBRUSH, &host_backdrop,
                            sizeof(host_backdrop));

    ComPtr<wuc::Desktop::ICompositorDesktopInterop> interop;
    if (FAILED(compositor_.As(&interop))) {
      return false;
    }
    const HRESULT hr =
        interop->CreateDesktopWindowTarget(hwnd_, false, &desktop_target_);
    if (FAILED(hr)) {
      VLOG(1) << "DesktopWindowTarget creation failed: 0x" << std::hex << hr;
      return false;
    }

    if (FAILED(compositor_->CreateSpriteVisual(&sprite_))) {
      return false;
    }
    ComPtr<wuc::IVisual> visual;
    ComPtr<wuc::IVisual2> sizing;
    if (FAILED(sprite_.As(&visual)) || FAILED(visual.As(&sizing)) ||
        FAILED(sizing->put_RelativeSizeAdjustment({1.0f, 1.0f})) ||
        !CreateCover()) {
      return false;
    }
    if (config_.popup) {
      visual->put_Opacity(0.0f);
    }
    const float scale = DpiScale();
    const gfx::Insets& insets = config_.popup_insets;
    if (!insets.IsEmpty()) {
      visual->put_Offset({insets.left() * scale, insets.top() * scale, 0.0f});
      visual->put_Size({-insets.width() * scale, -insets.height() * scale});
    }
    if (config_.corner_radius > 0.0f) {
      ApplyRoundedClip(visual.Get());
    }
    ComPtr<wuc::IVisual> root = visual;
    if (config_.popup) {
      ComPtr<wuc::IVisual2> root_sizing;
      ComPtr<wuc::IVisualCollection> children;
      if (FAILED(compositor_->CreateContainerVisual(&root_)) ||
          FAILED(root_.As(&root)) || FAILED(root.As(&root_sizing)) ||
          FAILED(root_sizing->put_RelativeSizeAdjustment({1.0f, 1.0f})) ||
          FAILED(root_->get_Children(&children)) ||
          FAILED(children->InsertAtTop(visual.Get()))) {
        return false;
      }
    }
    ComPtr<wuc::ICompositionTarget> target;
    if (FAILED(desktop_target_.As(&target)) ||
        FAILED(target->put_Root(root.Get()))) {
      return false;
    }

    if (!CreateBackdropBrush()) {
      return false;
    }
    UpdateSpriteBrush();
    return true;
  }

  bool CreateCover() {
    ComPtr<wuc::IVisual> cover;
    ComPtr<wuc::IVisual2> sizing;
    ComPtr<wuc::IContainerVisual> container;
    ComPtr<wuc::IVisualCollection> layers;
    return SUCCEEDED(compositor_->CreateSpriteVisual(&cover_)) &&
           SUCCEEDED(cover_.As(&cover)) && SUCCEEDED(cover.As(&sizing)) &&
           SUCCEEDED(sizing->put_RelativeSizeAdjustment({1.0f, 1.0f})) &&
           SUCCEEDED(sprite_.As(&container)) &&
           SUCCEEDED(container->get_Children(&layers)) &&
           SUCCEEDED(layers->InsertAtTop(cover.Get()));
  }

  void SetCoverOpacity(float opacity) {
    ReleaseFadeBatch();
    ComPtr<wuc::ICompositionObject> target;
    ComPtr<wuc::IVisual> visual;
    if (SUCCEEDED(cover_.As(&target)) && SUCCEEDED(cover_.As(&visual))) {
      target->StopAnimation(HStringReference(L"Opacity").Get());
      visual->put_Opacity(opacity);
    }
  }

  void FadeCover(float opacity) {
    ReleaseFadeBatch();
    ComPtr<wuc::ICompositionObject> target;
    ComPtr<wuc::IScalarKeyFrameAnimation> scalar;
    ComPtr<wuc::IKeyFrameAnimation> frames;
    ComPtr<wuc::ICompositionAnimation> animation;
    ComPtr<wuc::ICompositionEasingFunction> easing = CreateRecolorEasing();
    if (!easing || FAILED(cover_.As(&target)) ||
        FAILED(compositor_->CreateScalarKeyFrameAnimation(&scalar)) ||
        FAILED(scalar.As(&frames)) || FAILED(scalar.As(&animation))) {
      SetCoverOpacity(opacity);
      ReleaseBackdropWhenCovered();
      return;
    }
    frames->put_Duration({kActivationFadeDuration.InMicroseconds() * 10});
    scalar->InsertKeyFrameWithEasingFunction(1.0f, opacity, easing.Get());
    const bool covering =
        opacity >= 1.0f &&
        SUCCEEDED(compositor_->CreateScopedBatch(
            wuc::CompositionBatchTypes_Animation, &fade_batch_));
    target->StartAnimation(HStringReference(L"Opacity").Get(),
                           animation.Get());
    if (!covering) {
      return;
    }
    fade_batch_->End();
    auto completed = Callback<ABI::Windows::Foundation::ITypedEventHandler<
        IInspectable*, wuc::CompositionBatchCompletedEventArgs*>>(
        [this](IInspectable*, wuc::ICompositionBatchCompletedEventArgs*) {
          ReleaseBackdropWhenCovered();
          return S_OK;
        });
    if (!completed ||
        FAILED(fade_batch_->add_Completed(completed.Get(), &fade_token_))) {
      fade_batch_.Reset();
    }
  }

  void ReleaseBackdropWhenCovered() {
    if (!active_ && sprite_) {
      sprite_->put_Brush(nullptr);
    }
  }

  void ReleaseFadeBatch() {
    if (fade_batch_) {
      fade_batch_->remove_Completed(fade_token_);
      fade_batch_.Reset();
    }
  }

  float DpiScale() const { return ::GetDpiForWindow(hwnd_) / 96.0f; }

  void ApplyRoundedClip(wuc::IVisual* visual) {
    RECT client = {};
    if (!::GetClientRect(hwnd_, &client)) {
      return;
    }
    ComPtr<wuc::ICompositor7> compositor7;
    ComPtr<wuc::IRectangleClip> rectangle;
    ComPtr<wuc::ICompositionClip> clip;
    if (FAILED(compositor_.As(&compositor7)) ||
        FAILED(compositor7->CreateRectangleClip(&rectangle)) ||
        FAILED(rectangle.As(&clip))) {
      return;
    }
    const float scale = DpiScale();
    const ABI::Windows::Foundation::Numerics::Vector2 radius = {
        config_.corner_radius * scale, config_.corner_radius * scale};
    rectangle->put_Right(client.right - config_.popup_insets.width() * scale);
    rectangle->put_Bottom(client.bottom -
                          config_.popup_insets.height() * scale);
    rectangle->put_TopLeftRadius(radius);
    rectangle->put_TopRightRadius(radius);
    rectangle->put_BottomLeftRadius(radius);
    rectangle->put_BottomRightRadius(radius);
    visual->put_Clip(clip.Get());
  }

  static ComPtr<wuc::ICompositor> SharedCompositor() {
    static base::NoDestructor<ComPtr<wuc::ICompositor>> compositor;
    if (*compositor) {
      return *compositor;
    }
    ComPtr<IInspectable> instance;
    const HRESULT hr = ::RoActivateInstance(
        HStringReference(RuntimeClass_Windows_UI_Composition_Compositor).Get(),
        &instance);
    if (FAILED(hr) || FAILED(instance.As(&*compositor))) {
      VLOG(1) << "Compositor activation failed: 0x" << std::hex << hr;
      compositor->Reset();
    }
    return *compositor;
  }

  bool CreateDispatcherQueue() {
    static base::NoDestructor<
        ComPtr<ABI::Windows::System::IDispatcherQueueController>>
        queue;
    if (*queue) {
      return true;
    }
    HMODULE core_messaging = ::LoadLibraryW(L"CoreMessaging.dll");
    if (!core_messaging) {
      return false;
    }
    using CreateDispatcherQueueControllerFunction =
        HRESULT(WINAPI*)(DispatcherQueueOptions,
                         ABI::Windows::System::IDispatcherQueueController**);
    auto create = reinterpret_cast<CreateDispatcherQueueControllerFunction>(
        ::GetProcAddress(core_messaging, "CreateDispatcherQueueController"));
    if (!create) {
      return false;
    }
    DispatcherQueueOptions options = {sizeof(DispatcherQueueOptions),
                                      DQTYPE_THREAD_CURRENT, DQTAT_COM_NONE};
    const HRESULT hr = create(options, &*queue);
    if (FAILED(hr)) {
      VLOG(1) << "DispatcherQueue creation failed: 0x" << std::hex << hr;
      return false;
    }
    return true;
  }

  bool CreateBackdropBrush() {
    backdrop_.Reset();
    if (UsesWallpaperBackdrop(config_.material)) {
      ComPtr<wuc::ICompositorWithBlurredWallpaperBackdropBrush> wallpaper;
      if (SUCCEEDED(compositor_.As(&wallpaper)) &&
          SUCCEEDED(
              wallpaper->TryCreateBlurredWallpaperBackdropBrush(&backdrop_)) &&
          backdrop_) {
        return true;
      }
    }
    ComPtr<wuc::ICompositor3> compositor3;
    if (FAILED(compositor_.As(&compositor3))) {
      return false;
    }
    const HRESULT hr = compositor3->CreateHostBackdropBrush(&backdrop_);
    if (FAILED(hr) || !backdrop_) {
      VLOG(1) << "Host backdrop brush creation failed: 0x" << std::hex << hr;
      return false;
    }
    return true;
  }

  ComPtr<wuc::ICompositionBrush> CreateEffectBrush(
      wuc::ICompositionBrush* source_brush) {
    ComPtr<wuc::ICompositionEffectSourceParameterFactory> parameters;
    if (FAILED(ABI::Windows::Foundation::GetActivationFactory(
            HStringReference(
                RuntimeClass_Windows_UI_Composition_CompositionEffectSourceParameter)
                .Get(),
            &parameters))) {
      return nullptr;
    }
    ComPtr<wuc::ICompositionEffectSourceParameter> parameter;
    ComPtr<wgfx::IGraphicsEffectSource> source;
    if (FAILED(parameters->Create(HStringReference(kBackdropSourceName).Get(),
                                  &parameter)) ||
        FAILED(parameter.As(&source))) {
      return nullptr;
    }

    float luminosity_channels[4];
    float tint_channels[4];
    FillTintChannels(luminosity_channels, tint_channels);

    auto luminosity_color = Make<Effect>(kFloodEffectId);
    auto luminosity_blend = Make<Effect>(kBlendEffectId);
    auto tint_color = Make<Effect>(kFloodEffectId);
    auto tint_blend = Make<Effect>(kBlendEffectId);
    if (!luminosity_color || !luminosity_blend || !tint_color || !tint_blend) {
      return nullptr;
    }
    if (FAILED(luminosity_color->put_Name(
            HStringReference(kLuminosityName).Get())) ||
        FAILED(tint_color->put_Name(HStringReference(kTintName).Get())) ||
        !luminosity_color->SetColor(D2D1_FLOOD_PROP_COLOR,
                                    luminosity_channels) ||
        !tint_color->SetColor(D2D1_FLOOD_PROP_COLOR, tint_channels) ||
        !luminosity_blend->SetUInt32(D2D1_BLEND_PROP_MODE,
                                     D2D1_BLEND_MODE_LUMINOSITY) ||
        !tint_blend->SetUInt32(D2D1_BLEND_PROP_MODE,
                               D2D1_BLEND_MODE_COLOR)) {
      return nullptr;
    }
    luminosity_blend->SetSource(0, source.Get());
    luminosity_blend->SetSource(1, luminosity_color.Get());
    tint_blend->SetSource(0, luminosity_blend.Get());
    tint_blend->SetSource(1, tint_color.Get());

    ComPtr<wgfx::IGraphicsEffect> graph;
    if (FAILED(tint_blend.As(&graph))) {
      return nullptr;
    }
    ComPtr<wuc::ICompositionEffectFactory> factory;
    auto animated = Make<AnimatedColors>();
    if ((!animated || FAILED(compositor_->CreateEffectFactoryWithProperties(
                          graph.Get(), animated.Get(), &factory))) &&
        FAILED(compositor_->CreateEffectFactory(graph.Get(), &factory))) {
      return nullptr;
    }
    ComPtr<wuc::ICompositionEffectBrush> effect;
    if (!source_brush || FAILED(factory->CreateBrush(&effect)) ||
        FAILED(effect->SetSourceParameter(
            HStringReference(kBackdropSourceName).Get(), source_brush))) {
      return nullptr;
    }
    ComPtr<wuc::ICompositionBrush> brush;
    if (FAILED(effect.As(&brush))) {
      return nullptr;
    }
    return brush;
  }

  void FillTintChannels(float (&luminosity)[4], float (&tint)[4]) const {
    float luminosity_opacity = config_.luminosity_opacity;
    float tint_opacity = config_.tint_opacity;
    if (config_.material == SystemBackdropMaterial::kAcrylicThin) {
      luminosity_opacity *= kThinLuminosityScale;
    } else if (config_.material == SystemBackdropMaterial::kMicaAlt) {
      tint_opacity *= kAltTintScale;
    }
    FillChannels(config_.tint_color, luminosity_opacity, luminosity);
    FillChannels(config_.tint_color, tint_opacity, tint);
  }

  ABI::Windows::UI::Color NeutralColor() const {
    return dark_mode_ ? kDarkNeutralColor : kLightNeutralColor;
  }

  bool AnimateColors() {
    return AnimateTint(effect_brush_.Get()) &&
           AnimateTint(fallback_brush_.Get());
  }

  bool AnimateTint(wuc::ICompositionBrush* brush) {
    ComPtr<wuc::ICompositionObject> effect;
    if (!brush || FAILED(brush->QueryInterface(IID_PPV_ARGS(&effect)))) {
      return false;
    }
    float luminosity[4];
    float tint[4];
    FillTintChannels(luminosity, tint);
    return StartColorAnimation(effect.Get(), kAnimatedColors[0],
                               ChannelsToColor(tint)) &&
           StartColorAnimation(effect.Get(), kAnimatedColors[1],
                               ChannelsToColor(luminosity));
  }

  ComPtr<wuc::ICompositionEasingFunction> CreateRecolorEasing() {
    ComPtr<wuc::ICubicBezierEasingFunction> bezier;
    ComPtr<wuc::ICompositionEasingFunction> easing;
    if (FAILED(compositor_->CreateCubicBezierEasingFunction(
            {0.2f, 0.0f}, {0.0f, 1.0f}, &bezier)) ||
        FAILED(bezier.As(&easing))) {
      return nullptr;
    }
    return easing;
  }

  bool StartColorAnimation(wuc::ICompositionObject* target,
                           const wchar_t* property,
                           ABI::Windows::UI::Color to) {
    ComPtr<wuc::IColorKeyFrameAnimation> color;
    ComPtr<wuc::IKeyFrameAnimation> frames;
    ComPtr<wuc::ICompositionAnimation> animation;
    ComPtr<wuc::ICompositionEasingFunction> easing = CreateRecolorEasing();
    if (!easing || FAILED(compositor_->CreateColorKeyFrameAnimation(&color)) ||
        FAILED(color.As(&frames)) || FAILED(color.As(&animation))) {
      return false;
    }
    frames->put_Duration({kRecolorDuration.InMicroseconds() * 10});
    color->put_InterpolationColorSpace(wuc::CompositionColorSpace_Rgb);
    color->InsertKeyFrameWithEasingFunction(1.0f, to, easing.Get());
    return SUCCEEDED(target->StartAnimation(HStringReference(property).Get(),
                                            animation.Get()));
  }

  ComPtr<wuc::ICompositionBrush> CreateFallbackBrush() {
    ComPtr<wuc::ICompositionBrush> neutral;
    if (FAILED(compositor_->CreateColorBrushWithColor(NeutralColor(),
                                                      &neutral_brush_)) ||
        FAILED(neutral_brush_.As(&neutral))) {
      return nullptr;
    }
    return CreateEffectBrush(neutral.Get());
  }

  ComPtr<wuc::ICompositionBrush> CreateBackdropEffectBrush() {
    ComPtr<wuc::ICompositionBrush> backdrop;
    if (!backdrop_ || FAILED(backdrop_.As(&backdrop))) {
      return nullptr;
    }
    return CreateEffectBrush(backdrop.Get());
  }

  void UpdateSpriteBrush() {
    if (!sprite_ || !cover_) {
      return;
    }
    if (!fallback_brush_) {
      fallback_brush_ = CreateFallbackBrush();
      cover_->put_Brush(fallback_brush_.Get());
    }
    if (active_ && !effect_brush_) {
      effect_brush_ = CreateBackdropEffectBrush();
    }
    const bool show_backdrop = active_ && effect_brush_;
    sprite_->put_Brush(show_backdrop ? effect_brush_.Get() : nullptr);
    SetCoverOpacity(show_backdrop ? 0.0f : 1.0f);
  }

  void ApplyDwmFallback() {
    const DWM_SYSTEMBACKDROP_TYPE backdrop = ToDwmBackdrop(config_.material);
    ::DwmSetWindowAttribute(hwnd_, DWMWA_SYSTEMBACKDROP_TYPE, &backdrop,
                            sizeof(backdrop));
  }

  void ApplyDwmDarkMode() {
    const BOOL enabled = dark_mode_;
    ::DwmSetWindowAttribute(hwnd_, DWMWA_USE_IMMERSIVE_DARK_MODE, &enabled,
                            sizeof(enabled));
  }

  raw_ptr<views::Widget> widget_;
  HWND hwnd_ = nullptr;
  SystemBackdropConfig config_;
  bool active_ = false;
  bool dark_mode_ = true;
  bool composition_ = false;
  ComPtr<wuc::ICompositor> compositor_;
  ComPtr<wuc::Desktop::IDesktopWindowTarget> desktop_target_;
  ComPtr<wuc::IContainerVisual> root_;
  ComPtr<wuc::ISpriteVisual> sprite_;
  ComPtr<wuc::ISpriteVisual> cover_;
  ComPtr<wuc::ISpriteVisual> content_;
  ComPtr<wuc::ICompositionScopedBatch> fade_batch_;
  EventRegistrationToken fade_token_ = {};
  ComPtr<wuc::ICompositionBackdropBrush> backdrop_;
  ComPtr<wuc::ICompositionBrush> effect_brush_;
  ComPtr<wuc::ICompositionBrush> fallback_brush_;
  ComPtr<wuc::ICompositionColorBrush> neutral_brush_;
};

std::unique_ptr<SystemBackdropController> SystemBackdropController::Create(
    views::Widget* widget,
    const SystemBackdropConfig& config) {
  auto impl = std::make_unique<Impl>(widget, config);
  if (!impl->Initialize()) {
    return nullptr;
  }
  return std::unique_ptr<SystemBackdropController>(
      new SystemBackdropController(std::move(impl)));
}

SystemBackdropController::SystemBackdropController(std::unique_ptr<Impl> impl)
    : impl_(std::move(impl)) {}

SystemBackdropController::~SystemBackdropController() = default;

void SystemBackdropController::SetConfig(const SystemBackdropConfig& config) {
  impl_->SetConfig(config);
}

void SystemBackdropController::SetActive(bool active) {
  impl_->SetActive(active);
}

void SystemBackdropController::SetDarkMode(bool dark_mode) {
  impl_->SetDarkMode(dark_mode);
}

void SystemBackdropController::PlayReveal(float offset_y,
                                          base::TimeDelta duration) {
  impl_->PlayReveal(offset_y, duration);
}

bool SystemBackdropController::PlayDrawerReveal(const SkBitmap& content,
                                                float hidden_fraction,
                                                bool from_bottom,
                                                base::TimeDelta duration) {
  return impl_->PlayDrawerReveal(content, hidden_fraction, from_bottom,
                                 duration);
}

void SystemBackdropController::ClearDrawerContent() {
  impl_->ClearDrawerContent();
}

void SystemBackdropController::HideReveal() {
  impl_->HideReveal();
}

void SystemBackdropController::UpdateClip() {
  impl_->UpdateClip();
}

base::WeakPtr<SystemBackdropController> SystemBackdropController::GetWeakPtr() {
  return weak_factory_.GetWeakPtr();
}

}  // namespace rail

#endif
