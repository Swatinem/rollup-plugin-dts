import React from "react";

export interface MyComponentProps extends React.HtmlHTMLAttributes<HTMLDivElement> {
  foo: string;
}

export class MyComponent extends React.Component<MyComponentProps> {}
