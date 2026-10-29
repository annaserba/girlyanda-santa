import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const { input } = vi.hoisted(() => ({ input: vi.fn() }));
vi.mock("@/components/reui/phone-input", () => ({ PhoneInput: input }));
import { PhoneInput } from "@/components/phone-input";

describe("Russian-only phone field", () => {
  it("fixes the country and dial code without offering international input", () => {
    input.mockReturnValue(<input type="tel" />);
    renderToStaticMarkup(
      <PhoneInput id="phone" value="79991234567" onChange={vi.fn()} required />,
    );
    expect(input.mock.lastCall?.[0]).toMatchObject({
      id: "phone",
      value: "+79991234567",
      countries: ["RU"],
      defaultCountry: "RU",
      international: true,
      addInternationalOption: false,
      countryCallingCodeEditable: false,
      countrySelectProps: { disabled: true },
      required: true,
    });
  });
  it("normalizes pasted national numbers instead of appending the trunk prefix to +7", () => {
    input.mockReturnValue(<input type="tel" />);
    const onChange = vi.fn();
    renderToStaticMarkup(<PhoneInput value="" onChange={onChange} />);
    const preventDefault = vi.fn();
    input.mock.lastCall?.[0].onPaste({
      clipboardData: { getData: () => "8 (999) 123-45-67" },
      preventDefault,
    });
    expect(preventDefault).toHaveBeenCalledOnce();
    expect(onChange).toHaveBeenCalledWith("79991234567");
  });
  it("retains the digits-only storage contract when entering or clearing a number", () => {
    input.mockReturnValue(<input type="tel" />);
    const onChange = vi.fn();
    renderToStaticMarkup(<PhoneInput value="" onChange={onChange} />);
    const props = input.mock.lastCall?.[0];
    props.onChange("+79991234567");
    props.onChange("");
    expect(onChange.mock.calls).toEqual([["79991234567"], [""]]);
  });
});
